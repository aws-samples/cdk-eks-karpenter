import { App, Stack, StackProps } from 'aws-cdk-lib';
import { Vpc } from 'aws-cdk-lib/aws-ec2';
import { Cluster, CoreDnsComputeType, KubernetesVersion } from 'aws-cdk-lib/aws-eks';
import { ManagedPolicy, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

import { Karpenter } from '../src';

class TestEKSStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps = {}) {
    super(scope, id, props);

    const vpc = new Vpc(this, 'testVPC', {
      natGateways: 1,
    });

    const clusterRole = new Role(this, 'clusterRole', {
      assumedBy: new ServicePrincipal('eks.amazonaws.com'),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName('AmazonEKSClusterPolicy'),
        ManagedPolicy.fromAwsManagedPolicyName('AmazonEKSVPCResourceController'),
      ],
    });

    const cluster = new Cluster(this, 'testCluster', {
      vpc: vpc,
      role: clusterRole,
      version: KubernetesVersion.V1_21,
      defaultCapacity: 0,
      coreDnsComputeType: CoreDnsComputeType.FARGATE,
    });
    cluster.addFargateProfile('karpenter', {
      selectors: [
        {
          namespace: 'karpenter',
        },
        {
          namespace: 'kube-system',
          labels: {
            'k8s-app': 'kube-dns',
          },
        },
      ],
    });

    const karpenter = new Karpenter(this, 'Karpenter', {
      cluster: cluster,
    });
    karpenter.addProvisioner('spot-provisioner', {
      requirements: [{
        key: 'karpenter.sh/capacity-type',
        operator: 'In',
        values: ['spot'],
      }],
      limits: {
        resources: {
          cpu: 20,
        },
      },
      provider: {
        subnetSelector: {
          Name: `${this.stackName}/${vpc.node.id}/PrivateSubnet*`,
        },
        securityGroupSelector: {
          'aws:eks:cluster-name': cluster.clusterName,
        },
      },
    });
  }
}

const app = new App();

new TestEKSStack(app, 'test', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  }
});

app.synth();