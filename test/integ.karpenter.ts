import { KubectlV27Layer } from '@aws-cdk/lambda-layer-kubectl-v27';
import { App, CfnOutput, Stack, StackProps } from 'aws-cdk-lib';
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
      version: KubernetesVersion.V1_27, // OCI HELM repo only supported by new version.
      defaultCapacity: 0,
      coreDnsComputeType: CoreDnsComputeType.FARGATE,
      kubectlLayer: new KubectlV27Layer(this, 'KubectlLayer'), // new Kubectl lambda layer
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
      version: 'v0.32.0', // test the newest version
    });

    const nodeClass = karpenter.addEC2NodeClass('nodeclass', {
      amiFamily: 'AL2',
      subnetSelectorTerms: [
        {
          tags: {
            Name: `${this.stackName}/${vpc.node.id}/PrivateSubnet*`,
          },
        },
      ],
      securityGroupSelectorTerms: [
        {
          tags: {
            'aws:eks:cluster-name': cluster.clusterName,
          },
        },
      ],
      role: karpenter.nodeRole.roleName,
    });

    karpenter.addNodePool('nodepool', {
      template: {
        spec: {
          nodeClassRef: {
            apiVersion: 'karpenter.k8s.aws/v1beta1',
            kind: 'EC2NodeClass',
            name: nodeClass.name,
          },
          requirements: [
            {
              key: 'karpenter.k8s.aws/instance-category',
              operator: 'In',
              values: ['m'],
            },
            {
              key: 'kubernetes.io/arch',
              operator: 'In',
              values: ['amd64'],
            },
          ],
        },
      },
    });

    karpenter.addManagedPolicyToKarpenterRole(ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'));

    new CfnOutput(this, 'ClusterName', {
      value: cluster.clusterName,
    });

    new CfnOutput(this, 'ClusterAdminRole', {
      value: cluster.adminRole.roleArn,
    });

    new CfnOutput(this, 'UpdateKubeConfigCommand', {
      value: `aws eks update-kubeconfig --name ${cluster.clusterName} --role-arn ${cluster.adminRole.roleArn}`
    });
  }
}

const app = new App();

new TestEKSStack(app, 'test', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});

app.synth();