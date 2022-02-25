import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { Cluster, KubernetesVersion } from 'aws-cdk-lib/aws-eks';
import { Karpenter } from '../src';

describe('Karpenter installation', () => {
  it('shuold install the latest version by default', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'test-stack');

    const cluster = new Cluster(stack, 'testcluster', {
      version: KubernetesVersion.V1_21,
    });

    new Karpenter(stack, 'Karpenter', {
      cluster: cluster,
    });

    const t = Template.fromStack(stack);
    t.hasResourceProperties('Custom::AWSCDK-EKS-HelmChart', {
      Version: Match.absent(),
    });
  });

  it('should install the desired version', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'test-stack');

    const cluster = new Cluster(stack, 'testcluster', {
      version: KubernetesVersion.V1_21,
    });

    // Create Karpenter install with non-default version
    new Karpenter(stack, 'Karpenter', {
      cluster: cluster,
      version: 'v0.6.0',
    });

    const t = Template.fromStack(stack);
    t.hasResource('Custom::AWSCDK-EKS-Cluster', {});
    t.hasResourceProperties('Custom::AWSCDK-EKS-HelmChart', {
      Version: 'v0.6.0',
    });
  });

  it('should install in a different namespace', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'test-stack');

    const cluster = new Cluster(stack, 'testcluster', {
      version: KubernetesVersion.V1_21,
    });

    // Create Karpenter install with non-default namespace
    new Karpenter(stack, 'Karpenter', {
      cluster: cluster,
      namespace: 'kar-penter',
    });

    const t = Template.fromStack(stack);
    t.hasResource('Custom::AWSCDK-EKS-Cluster', {});
    t.hasResourceProperties('Custom::AWSCDK-EKS-HelmChart', {
      Namespace: 'kar-penter',
    });
  });
});
