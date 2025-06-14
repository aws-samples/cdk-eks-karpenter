import { Aws, CfnJson, Duration } from 'aws-cdk-lib';
import { Cluster, HelmChart } from 'aws-cdk-lib/aws-eks';
import { Rule } from 'aws-cdk-lib/aws-events';
import { SqsQueue } from 'aws-cdk-lib/aws-events-targets';
import { CfnInstanceProfile, IManagedPolicy, ManagedPolicy, Policy, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { IQueue, Queue } from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';
import * as semver from 'semver';
import { Utils } from './utils';

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
   * The Kubernetes ServiceAccount name to use
   *
   * @default karpenter
   */
  readonly serviceAccountName?: string;

  /**
   * The helm chart version to install
   *
   * @default - latest
   */
  readonly version: string;

  /**
   * Extra values to pass to the Karpenter Helm chart
   */
  readonly helmExtraValues?: Record<string, any>;

  /**
   * Custom NodeRole to pass for Karpenter Nodes
   */
  readonly nodeRole?: Role;
}

export class Karpenter extends Construct {
  public readonly cluster: Cluster;
  public readonly namespace: string;
  public readonly serviceAccountName: string;
  public readonly version: string;
  public readonly nodeRole: Role;
  public readonly helmExtraValues: any;

  private readonly chart: HelmChart;
  private readonly serviceAccount: any;
  public helmChartValues: Record<string, any>;
  private controllerIAMPolicyStatements: PolicyStatement[];
  private interruptionQueue: IQueue | undefined;

  constructor(scope: Construct, id: string, props: KarpenterProps) {
    super(scope, id);

    this.cluster = props.cluster;
    this.namespace = props.namespace ?? 'karpenter';
    this.serviceAccountName = props.serviceAccountName ?? 'karpenter';
    this.version = props.version;
    this.helmExtraValues = props.helmExtraValues ?? {};

    this.controllerIAMPolicyStatements = [];
    this.interruptionQueue = undefined;

    this.helmChartValues = {
      settings: {
        aws: {},
      },
    };

    /*
     * We create a node role for Karpenter managed nodes, alongside an instance profile for the EC2
     * instances that will be managed by karpenter.
     *
     * We will also create a role mapping in the `aws-auth` ConfigMap so that the nodes can authenticate
     * with the Kubernetes API using IAM.
     *
     * Create Node Role if nodeRole not added as prop
     * Make sure that the Role that is added does not have an Instance Profile associated to it
     * since we will create it here.
    */
    if (!props.nodeRole) {
      this.nodeRole = new Role(this, 'NodeRole', {
        assumedBy: new ServicePrincipal(`ec2.${Aws.URL_SUFFIX}`),
        managedPolicies: [
          ManagedPolicy.fromAwsManagedPolicyName('AmazonEKS_CNI_Policy'),
          ManagedPolicy.fromAwsManagedPolicyName('AmazonEKSWorkerNodePolicy'),
          ManagedPolicy.fromAwsManagedPolicyName('AmazonEC2ContainerRegistryReadOnly'),
          ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
        ],
      });
    } else {
      this.nodeRole = props.nodeRole;
    }


    const instanceProfile = new CfnInstanceProfile(this, 'InstanceProfile', {
      roles: [this.nodeRole.roleName],
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

    this.serviceAccount = this.cluster.addServiceAccount('karpenter', {
      name: this.serviceAccountName,
      namespace: this.namespace,
    });


    // Setup the controller IAM Policy statements
    this.addControllerPolicyIAMPolicyStatements();

    // Set repoUrl based on which version of Karpenter we want to install
    const repoUrl = this.helmRepoURLFromKarpenterVersion();

    // Setup the interruption queue, different helm chart versions have different key names
    this.interruptionQueue = this.addInterruptionQueue();

    // Manage different helm values depending on Karpenter version
    if (semver.gte(this.version, 'v0.19.0') && semver.lte(this.version, 'v0.32.0')) {
      this.helmChartValues.settings.aws = {
        clusterName: this.cluster.clusterName,
        clusterEndpoint: this.cluster.clusterEndpoint,
        defaultInstanceProfile: instanceProfile.ref,
        interruptionQueueName: this.interruptionQueue?.queueName,
      };
    }
    if (semver.gte(this.version, 'v0.32.0')) {
      this.helmChartValues.settings = {
        clusterName: this.cluster.clusterName,
        clusterEndpoint: this.cluster.clusterEndpoint,
        interruptionQueue: this.interruptionQueue?.queueName,
      };
    }

    // These are fixed values that we supply to the Helm Chart.
    this.helmChartValues = {
      ...{
        serviceAccount: {
          create: false,
          name: this.serviceAccount.serviceAccountName,
          annotations: {
            'eks.amazonaws.com/role-arn': this.serviceAccount.role.roleArn,
          },
        },
      },
      ...this.helmChartValues,
    };

    new Policy(this, 'ControllerPolicy', {
      roles: [this.serviceAccount.role],
      statements: this.controllerIAMPolicyStatements,
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
      version: this.version,
      createNamespace: false,
      // We will merge our dyanmic `helmExtraValues` with the fixed values. Where the fixed values
      // will override the dynamic values.
      values: { ...this.helmExtraValues, ...this.helmChartValues },
    });


    // If we are not installing it in the `kube-system` namespace:
    // Note: We should be installing it in kube-system, please see: https://github.com/aws/karpenter-provider-aws/blob/fd2b60759f81dc0c868810cc44443103067c4880/website/content/en/v0.36/upgrading/upgrade-guide.md?plain=1#L91
    // Also see https://github.com/aws-samples/cdk-eks-karpenter/issues/189 and https://github.com/aws-samples/cdk-eks-karpenter/issues/173
    if (this.namespace != 'kube-system') {
      const namespace = this.cluster.addManifest('karpenter-namespace', {
        apiVersion: 'v1',
        kind: 'Namespace',
        metadata: {
          name: this.namespace,
        },
      });
      // If we are creating a namespace, we need to link it to the service account and the chart, so they are deployed in the correct order.
      this.serviceAccount.node.addDependency(namespace);
      this.chart.node.addDependency(namespace);
    }
  }

  /**
   * addEC2NodeClass adds a EC2NodeClass to the Karpenter configuration.
   *
   * @param id must consist of lower case alphanumeric characters, \'-\' or \'.\', and must start and end with an alphanumeric character
   * @param ec2NodeClassSpec spec of Karpenters EC2NodeClass API
   *
   * @returns the metadata object of the created manifest
   */
  public addEC2NodeClass(id: string, ec2NodeClassSpec: Record<string, any>): Record<string, any> {
    // Validate the name of the resource
    if (!Utils.validateKubernetesNameConformance(id)) {
      throw new Error('name does not conform to k8s policy');
    }

    // Ensure we provide a valid spec
    Utils.hasRequiredKeys(ec2NodeClassSpec, [
      'amiFamily', 'subnetSelectorTerms', 'securityGroupSelectorTerms', 'role',
    ]);

    return this.addManifest(id, {
      apiVersion: 'karpenter.k8s.aws/v1',
      kind: 'EC2NodeClass',
      metadata: {
        name: id,
        namespace: this.namespace,
      },
      spec: ec2NodeClassSpec,
    });
  }

  /**
   * addNodePool adds a NodePool to the Karpenter configuration.
   *
   * @param id must consist of lower case alphanumeric characters, \'-\' or \'.\', and must start and end with an alphanumeric character
   * @param nodePoolSpec spec of Karpenters NodePool API
   *
   * @returns the metadata object of the created manifest
   */
  public addNodePool(id: string, nodePoolSpec: Record<string, any>): Record<string, any> {
    // Validate the name of the resource
    if (!Utils.validateKubernetesNameConformance(id)) {
      throw new Error('name does not conform to k8s policy');
    }

    // Ensure we provide a valid spec
    Utils.hasRequiredKeys(nodePoolSpec.template.spec, ['nodeClassRef', 'requirements']);

    return this.addManifest(id, {
      apiVersion: 'karpenter.sh/v1',
      kind: 'NodePool',
      metadata: {
        name: id,
        namespace: this.namespace,
      },
      spec: nodePoolSpec,
    });
  }

  /**
   * addProvisioner adds a provisioner manifest to the cluster. Currently the provisioner spec
   * parameter is relatively free form.
   *
   * @param id - must consist of lower case alphanumeric characters, \'-\' or \'.\', and must start and end with an alphanumeric character
   * @param provisionerSpec - spec of Karpenters Provisioner object.
   *
   * @deprecated This method should not be used with Karpenter >v0.32.0
   */
  public addProvisioner(id: string, provisionerSpec: Record<string, any>): void {
    // Validate the name of the resource
    if (!Utils.validateKubernetesNameConformance(id)) {
      throw new Error('name does not conform to k8s policy');
    }
    // If later than version v0.32.0, we should throw an exception here as the APIs
    // changed after that version and this method should not be used.
    if (semver.gte('v0.32.0', this.version)) {
      throw new Error('This method is not supported for this Karpenter version. Please use addEC2NodeClass instead.');
    }
    this.addManifest(id, {
      apiVersion: 'karpenter.k8s.aws/v1alpha5',
      kind: 'Provisioner',
      metadata: {
        name: id,
        namespace: this.namespace,
      },
      spec: provisionerSpec,
    });
  }

  /**
   * addNodeTemplate adds a node template manifest to the cluster. Currently the node template spec
   * parameter is relatively free form.
   *
   * @param id - must consist of lower case alphanumeric characters, \'-\' or \'.\', and must start and end with an alphanumeric character
   * @param nodeTemplateSpec - spec of Karpenters Node Template object.
   *
   * @deprecated This method should not be used with Karpenter >v0.32.0
   */
  public addNodeTemplate(id: string, nodeTemplateSpec: Record<string, any>): void {
    // Validate the name of the resource
    if (!Utils.validateKubernetesNameConformance(id)) {
      throw new Error('name does not conform to k8s policy');
    }

    // If version >= v0.32.0, we should throw an exception here as the APIs
    // changed after that version and this method should not be used.
    if (semver.gte('v0.32.0', this.version)) {
      throw new Error('This method is not supported for this Karpenter version. Please use addEC2NodeClass instead.');
    }
    this.addManifest(id, {
      apiVersion: 'karpenter.k8s.aws/v1',
      kind: 'AWSNodeTemplate',
      metadata: {
        namespace: this.namespace,
      },
      spec: nodeTemplateSpec,
    });
  }

  /**
   * addManifest crafts Kubernetes manifests for the specific APIs
   *
   * @param id
   * @param apiVersion
   * @param kind
   * @param metadata
   * @param spec
   *
   * @returns the metadata object of the created manifest
   */
  private addManifest(
    id: string,
    props: {
      apiVersion: string;
      kind: string;
      metadata: Record<string, any>;
      spec: Record<string, any>;
    },
  ): Record<string, any> {
    let defaultMetadata: Record<string, any> = {
      name: id,
    };
    let m = {
      apiVersion: props.apiVersion,
      kind: props.kind,
      metadata: {
        // We will merge our metadata details. The parameters provided will be overwritten by
        // defaultMetadata
        ...props.metadata, ...defaultMetadata,
      },
      spec: props.spec,
    };
    let manifstResource = this.cluster.addManifest(id, m);
    manifstResource.node.addDependency(this.chart);

    return m.metadata;
  }

  /**
   * addManagedPolicyToKarpenterRole adds Managed Policies To Karpenter Role.
   *
   * @param managedPolicy - iam managed policy to add to the karpenter role.
   */
  public addManagedPolicyToKarpenterRole(managedPolicy: IManagedPolicy): void {
    this.serviceAccount.role.addManagedPolicy(managedPolicy);
  }

  /**
   * Get the Helm repo URL based on the Karpenter version
   *
   * @returns string
   */
  private helmRepoURLFromKarpenterVersion(): string {
    if (semver.satisfies(this.version, '>= v0.17.0')) {
      return 'oci://public.ecr.aws/karpenter/karpenter';
    }

    return 'https://charts.karpenter.sh';
  }

  /**
   * addInterruptionQueue adds the interruption queue setup if neceesary
   */
  private addInterruptionQueue(): IQueue | undefined {
    if (semver.lte(this.version, 'v0.19.0')) {
      return undefined;
    };

    // new version need SQS to handle the interruption
    const interruptionQueue = new Queue(this, 'KarpenterInterruptionQueue', {
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
      rule.addTarget(new SqsQueue(interruptionQueue));
    }

    // new version need SQS privilege
    this.controllerIAMPolicyStatements.push(
      new PolicyStatement({
        actions: [
          'sqs:DeleteMessage',
          'sqs:GetQueueAttributes',
          'sqs:GetQueueUrl',
          'sqs:ReceiveMessage',
        ],
        resources: [interruptionQueue.queueArn],
      }),
    );

    return interruptionQueue;
  }

  /**
   * Configure the IAM Policy StatementsPolicies for the Controller
   * taken from https://raw.githubusercontent.com/aws/karpenter/v0.32.0/website/content/en/preview/getting-started/getting-started-with-karpenter/cloudformation.yaml
   */
  private addControllerPolicyIAMPolicyStatements(): void {
    const clusterName = this.cluster.clusterName;
    const region = Aws.REGION;
    const partition = Aws.PARTITION;
    const accountId = Aws.ACCOUNT_ID;

    const conditionCfnJson = (id: string, value: Record<string, any>) => new CfnJson(this, id, { value: value });

    this.controllerIAMPolicyStatements.push(
      new PolicyStatement({
        sid: 'AllowScopedEC2InstanceAccessActions',
        resources: [
          `arn:${partition}:ec2:${region}::image/*`,
          `arn:${partition}:ec2:${region}::snapshot/*`,
          `arn:${partition}:ec2:${region}:*:security-group/*`,
          `arn:${partition}:ec2:${region}:*:subnet/*`,
        ],
        actions: ['ec2:RunInstances', 'ec2:CreateFleet'],
      }),
      new PolicyStatement({
        sid: 'AllowScopedEC2LaunchTemplateAccessActions',
        resources: [`arn:${partition}:ec2:${region}:*:launch-template/*`],
        actions: ['ec2:RunInstances', 'ec2:CreateFleet'],
        conditions: {
          StringEquals: conditionCfnJson('AllowScopedEC2InstanceAccessActions-ResourceTagClusterName', {
            [`aws:ResourceTag/kubernetes.io/cluster/${clusterName}`]: 'owned',
          }),
          StringLike: conditionCfnJson('AllowScopedEC2InstanceAccessActions-ResourceTagNodePool', {
            'aws:ResourceTag/karpenter.sh/nodepool': '*',
          }),
        },
      }),
      new PolicyStatement({
        sid: 'AllowScopedEC2InstanceActionsWithTags',
        resources: [
          `arn:${partition}:ec2:${region}:*:fleet/*`,
          `arn:${partition}:ec2:${region}:*:instance/*`,
          `arn:${partition}:ec2:${region}:*:volume/*`,
          `arn:${partition}:ec2:${region}:*:network-interface/*`,
          `arn:${partition}:ec2:${region}:*:launch-template/*`,
          `arn:${partition}:ec2:${region}:*:spot-instances-request/*`,
        ],
        actions: ['ec2:RunInstances', 'ec2:CreateFleet', 'ec2:CreateLaunchTemplate'],
        conditions: {
          StringEquals: conditionCfnJson('AllowScopedEC2InstanceActionsWithTags-1', {
            [`aws:RequestTag/kubernetes.io/cluster/${clusterName}`]: 'owned',
            'aws:RequestTag/eks:eks-cluster-name': clusterName,
          }),
          StringLike: conditionCfnJson('AllowScopedEC2InstanceActionsWithTags-2', {
            'aws:RequestTag/karpenter.sh/nodepool': '*',
          }),
        },
      }),
      new PolicyStatement({
        sid: 'AllowScopedResourceCreationTagging',
        resources: [
          `arn:${partition}:ec2:${region}:*:fleet/*`,
          `arn:${partition}:ec2:${region}:*:instance/*`,
          `arn:${partition}:ec2:${region}:*:volume/*`,
          `arn:${partition}:ec2:${region}:*:network-interface/*`,
          `arn:${partition}:ec2:${region}:*:launch-template/*`,
          `arn:${partition}:ec2:${region}:*:spot-instances-request/*`,
        ],
        actions: ['ec2:CreateTags'],
        conditions: {
          StringEquals: conditionCfnJson('AllowScopedResourceCreationTagging-1', {
            [`aws:RequestTag/kubernetes.io/cluster/${clusterName}`]: 'owned',
            'aws:RequestTag/eks:eks-cluster-name': clusterName,
            'ec2:CreateAction': ['RunInstances', 'CreateFleet', 'CreateLaunchTemplate'],
          }),
          StringLike: conditionCfnJson('AllowScopedResourceCreationTagging-2', {
            'aws:RequestTag/karpenter.sh/nodepool': '*',
          }),
        },
      }),
      new PolicyStatement({
        sid: 'AllowScopedResourceTagging',
        resources: [`arn:${partition}:ec2:${region}:*:instance/*`],
        actions: ['ec2:CreateTags'],
        conditions: {
          'StringEquals': conditionCfnJson('AllowScopedResourceTagging-1', {
            [`aws:ResourceTag/kubernetes.io/cluster/${clusterName}`]: 'owned',
          }),
          'StringLike': conditionCfnJson('AllowScopedResourceTagging-2', {
            'aws:ResourceTag/karpenter.sh/nodepool': '*',
          }),
          'StringEqualsIfExists': conditionCfnJson('AllowScopedResourceTagging-3', {
            'aws:RequestTag/eks:eks-cluster-name': clusterName,
          }),
          'ForAllValues:StringEquals': conditionCfnJson('AllowScopedResourceTagging-4', {
            'aws:TagKeys': ['eks:eks-cluster-name', 'karpenter.sh/nodeclaim', 'Name'],
          }),
        },
      }),
      new PolicyStatement({
        sid: 'AllowScopedDeletion',
        resources: [
          `arn:${partition}:ec2:${region}:*:instance/*`,
          `arn:${partition}:ec2:${region}:*:launch-template/*`,
        ],
        actions: ['ec2:TerminateInstances', 'ec2:DeleteLaunchTemplate'],
        conditions: {
          StringEquals: conditionCfnJson('AllowScopedDeletion-1', {
            [`aws:ResourceTag/kubernetes.io/cluster/${clusterName}`]: 'owned',
          }),
          StringLike: conditionCfnJson('AllowScopedDeletion-2', {
            'aws:ResourceTag/karpenter.sh/nodepool': '*',
          }),
        },
      }),
      new PolicyStatement({
        sid: 'AllowRegionalReadActions',
        resources: ['*'],
        actions: [
          'ec2:DescribeImages',
          'ec2:DescribeInstances',
          'ec2:DescribeInstanceTypeOfferings',
          'ec2:DescribeInstanceTypes',
          'ec2:DescribeLaunchTemplates',
          'ec2:DescribeSecurityGroups',
          'ec2:DescribeSpotPriceHistory',
          'ec2:DescribeSubnets',
        ],
        conditions: {
          StringEquals: {
            'aws:RequestedRegion': region,
          },
        },
      }),
      new PolicyStatement({
        sid: 'AllowSSMReadActions',
        resources: [`arn:${partition}:ssm:${region}::parameter/aws/service/*`],
        actions: ['ssm:GetParameter'],
      }),
      new PolicyStatement({
        sid: 'AllowPricingReadActions',
        resources: ['*'],
        actions: ['pricing:GetProducts'],
      }),
      new PolicyStatement({
        sid: 'AllowPassingInstanceRole',
        resources: [this.nodeRole.roleArn],
        actions: ['iam:PassRole'],
        conditions: {
          StringEquals: {
            'iam:PassedToService': ['ec2.amazonaws.com', 'ec2.amazonaws.com.cn'],
          },
        },
      }),
      new PolicyStatement({
        sid: 'AllowScopedInstanceProfileCreationActions',
        resources: [`arn:${partition}:iam::${accountId}:instance-profile/*`],
        actions: ['iam:CreateInstanceProfile'],
        conditions: {
          StringEquals: conditionCfnJson('AllowScopedInstanceProfileCreationActions-1', {
            [`aws:RequestTag/kubernetes.io/cluster/${clusterName}`]: 'owned',
            'aws:RequestTag/eks:eks-cluster-name': clusterName,
            'aws:RequestTag/topology.kubernetes.io/region': region,
          }),
          StringLike: conditionCfnJson('AllowScopedInstanceProfileCreationActions-2', {
            'aws:RequestTag/karpenter.k8s.aws/ec2nodeclass': '*',
          }),
        },
      }),
      new PolicyStatement({
        sid: 'AllowScopedInstanceProfileTagActions',
        resources: [`arn:${partition}:iam::${accountId}:instance-profile/*`],
        actions: ['iam:TagInstanceProfile'],
        conditions: {
          StringEquals: conditionCfnJson('AllowScopedInstanceProfileTagActions-1', {
            [`aws:ResourceTag/kubernetes.io/cluster/${clusterName}`]: 'owned',
            'aws:ResourceTag/topology.kubernetes.io/region': region,
            [`aws:RequestTag/kubernetes.io/cluster/${clusterName}`]: 'owned',
            'aws:RequestTag/eks:eks-cluster-name': clusterName,
            'aws:RequestTag/topology.kubernetes.io/region': region,
          }),
          StringLike: conditionCfnJson('AllowScopedInstanceProfileTagActions-2', {
            'aws:ResourceTag/karpenter.k8s.aws/ec2nodeclass': '*',
            'aws:RequestTag/karpenter.k8s.aws/ec2nodeclass': '*',
          }),
        },
      }));
  }
}
