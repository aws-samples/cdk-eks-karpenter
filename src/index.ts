import { Aws, Duration } from 'aws-cdk-lib';
import { Cluster, HelmChart } from 'aws-cdk-lib/aws-eks';
import { Rule } from 'aws-cdk-lib/aws-events';
import { SqsQueue } from 'aws-cdk-lib/aws-events-targets';
import { CfnInstanceProfile, ManagedPolicy, Policy, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Queue } from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';

export interface KarpenterProps {
  /**
   * The EKS Cluster to attach to
   */
  readonly cluster: Cluster;

  /**
   * The Kubernetes namespace to install to
   *
   * @default karpenter
   */
  readonly namespace?: string;

  /**
   * The helm chart version to install
   *
   * @default - latest
   */
  readonly version?: string;
}

export class Karpenter extends Construct {
  public readonly cluster: Cluster;
  public readonly namespace: string;
  public readonly version?: string;
  public readonly nodeRole: Role;
  private readonly chart: HelmChart;

  constructor(scope: Construct, id: string, props: KarpenterProps) {
    super(scope, id);

    this.cluster = props.cluster;
    this.namespace = props.namespace ?? 'karpenter';
    this.version = props.version;

    /*
     * We create a node role for Karpenter managed nodes, alongside an instance profile for the EC2
     * instances that will be managed by karpenter.
     *
     * We will also create a role mapping in the `aws-auth` ConfigMap so that the nodes can authenticate
     * with the Kubernetes API using IAM.
     */
    this.nodeRole = new Role(this, 'NodeRole', {
      assumedBy: new ServicePrincipal(`ec2.${Aws.URL_SUFFIX}`),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName('AmazonEKS_CNI_Policy'),
        ManagedPolicy.fromAwsManagedPolicyName('AmazonEKSWorkerNodePolicy'),
        ManagedPolicy.fromAwsManagedPolicyName('AmazonEC2ContainerRegistryReadOnly'),
        ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
      ],
    });

    const instanceProfile = new CfnInstanceProfile(this, 'InstanceProfile', {
      roles: [this.nodeRole.roleName],
      instanceProfileName: `${this.cluster.clusterName}-${id}`, // Must be specified to avoid CFN error
    });

    this.cluster.awsAuth.addRoleMapping(this.nodeRole, {
      username: 'system:node:{{EC2PrivateDNSName}}',
      groups: [
        'system:bootstrappers',
        'system:nodes',
      ],
    });

    /**
     * For the Karpenter controller to be able to talk to the AWS APIs, we need to set up a few
     * resources which will allow the Karpenter controller to use IAM Roles for Service Accounts
     */
    const namespace = this.cluster.addManifest('namespace', {
      apiVersion: 'v1',
      kind: 'Namespace',
      metadata: {
        name: this.namespace,
      },
    });

    const serviceAccount = this.cluster.addServiceAccount('karpenter', {
      namespace: this.namespace,
    });
    serviceAccount.node.addDependency(namespace);

    // diffrent values for diffrent Karpenter versions
    var iamPolicy = [
      new PolicyStatement({
        actions: [
          'ec2:CreateLaunchTemplate',
          'ec2:DeleteLaunchTemplate',
          'ec2:CreateFleet',
          'ec2:RunInstances',
          'ec2:CreateTags',
          'ec2:TerminateInstances',
          'ec2:DescribeLaunchTemplates',
          'ec2:DescribeInstances',
          'ec2:DescribeSecurityGroups',
          'ec2:DescribeSubnets',
          'ec2:DescribeInstanceTypes',
          'ec2:DescribeInstanceTypeOfferings',
          'ec2:DescribeAvailabilityZones',
          'ssm:GetParameter',
        ],
        resources: ['*'],
      }),
      new PolicyStatement({
        actions: ['iam:PassRole'],
        resources: [this.nodeRole.roleArn],
      }),
    ];
    var repoUrl = 'https://charts.karpenter.sh';
    var repoValues: any = {
      serviceAccount: {
        create: false,
        name: serviceAccount.serviceAccountName,
        annotations: {
          'eks.amazonaws.com/role-arn': serviceAccount.role.roleArn,
        },
      },
      clusterName: this.cluster.clusterName,
      clusterEndpoint: this.cluster.clusterEndpoint,
      aws: {
        defaultInstanceProfile: instanceProfile.ref,
      },
    };

    if (this.version === undefined || this.compareVersion(this.version, 'v0.17.0')
      || this.version === 'v0.17.0') {
      repoUrl = 'oci://public.ecr.aws/karpenter/karpenter';
      if (this.version === undefined || this.compareVersion(this.version, 'v0.19.0') ||
        this.version==='v0.19.0') {

        // new version need SQS to handle the interruption
        const karpenterInterruptionQueue = new Queue(this, 'KarpenterInterruptionQueue', {
          queueName: this.cluster.clusterName,
          retentionPeriod: Duration.minutes(5),
        });

        const rules = [
          // ScheduledChangeRule
          new Rule(this, 'ScheduledChangeRule', {
            eventPattern: {
              source: ['aws.health'],
              detailType: ['AWS Health Event'],
            },
          }),
          // SpotInterruptionRule
          new Rule(this, 'SpotInterruptionRule', {
            eventPattern: {
              source: ['aws.ec2'],
              detailType: ['EC2 Spot Instance Interruption Warning'],
            },
          }),
          // RebalanceRule
          new Rule(this, 'RebalanceRule', {
            eventPattern: {
              source: ['aws.ec2'],
              detailType: ['EC2 Instance Rebalance Recommendation'],
            },
          }),
          // InstanceStateChangeRule
          new Rule(this, 'InstanceStateChangeRule', {
            eventPattern: {
              source: ['aws.ec2'],
              detailType: ['EC2 Instance State-change Notification'],
            },
          }),
        ];

        for (var rule of rules) {
          rule.addTarget(new SqsQueue(karpenterInterruptionQueue));
        }
        // new version need SQS privilege
        iamPolicy.push(
          new PolicyStatement({
            actions: [
              'sqs:DeleteMessage',
              'sqs:GetQueueAttributes',
              'sqs:GetQueueUrl',
              'sqs:ReceiveMessage',
            ],
            resources: [karpenterInterruptionQueue.queueArn],
          }),
        );

        // new version use new Repo values
        delete repoValues.clusterName;
        delete repoValues.clusterEndpoint;
        delete repoValues.aws;
        repoValues.settings = {
          aws: {
            clusterName: this.cluster.clusterName,
            clusterEndpoint: this.cluster.clusterEndpoint,
            interruptionQueueName: karpenterInterruptionQueue.queueName,
            defaultInstanceProfile: instanceProfile.ref,
          },
        };
      }
    }

    new Policy(this, 'ControllerPolicy', {
      roles: [serviceAccount.role],
      statements: iamPolicy,
    });

    /**
     * Finally, we can go ahead and install the Helm chart provided for Karpenter with the inputs
     * we desire.
     */
    this.chart = this.cluster.addHelmChart('karpenter', {
      // This one is important, if we don't ask helm to wait for resources to become available, the
      // subsequent creation of karpenter resources will fail.
      wait: true,
      chart: 'karpenter',
      release: 'karpenter',
      repository: repoUrl,
      namespace: this.namespace,
      version: this.version ?? undefined,
      createNamespace: false,
      values: repoValues,
    });
    this.chart.node.addDependency(namespace);
  }

  /**
   * compareVersion compare two Karpenter version, return true if the v1 is later one
   * parameter is relatively free form.
   *
   * @param v1 - first compared version
   * @param v2 - second compared version
   */
  private compareVersion(v1: string, v2:string): boolean {

    const v1Arr = v1.split('.');
    const v2Arr = v2.split('.');

    for (var i in v1Arr) {
      if (v2Arr[i] === undefined) {return true;}
      if (parseInt(v1Arr[i].replace('v', '')) > parseInt(v2Arr[i].replace('v', ''))) {return true;}
    }
    return false;
  }

  /**
   * addProvisioner adds a provisioner manifest to the cluster. Currently the provisioner spec
   * parameter is relatively free form.
   *
   * @param id - must consist of lower case alphanumeric characters, \'-\' or \'.\', and must start and end with an alphanumeric character
   * @param provisionerSpec - spec of Karpenters Provisioner object.
   */
  public addProvisioner(id: string, provisionerSpec: Record<string, any>): void {
    let m = {
      apiVersion: 'karpenter.sh/v1alpha5',
      kind: 'Provisioner',
      metadata: {
        name: id,
        namespace: this.namespace,
      },
      spec: {},
    };
    m.spec = provisionerSpec;
    let provisioner = this.cluster.addManifest(id, m);
    provisioner.node.addDependency(this.chart);
  }

  /**
   * addProvisioner adds a provisioner manifest to the cluster. Currently the provisioner spec
   * parameter is relatively free form.
   *
   * @param id - must consist of lower case alphanumeric characters, \'-\' or \'.\', and must start and end with an alphanumeric character
   * @param nodeTemplateSpec - spec of Karpenters Node Template object.
   */
  public addNodeTemplate(id: string, nodeTemplateSpec: Record<string, any>): void {
    let m = {
      apiVersion: 'karpenter.k8s.aws/v1alpha1',
      kind: 'AWSNodeTemplate',
      metadata: {
        name: id,
        namespace: this.namespace,
      },
      spec: {},
    };
    m.spec = nodeTemplateSpec;
    let provisioner = this.cluster.addManifest(id, m);
    provisioner.node.addDependency(this.chart);
  }
}