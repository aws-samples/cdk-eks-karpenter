import * as cdk from 'aws-cdk-lib';
import { Template, Capture } from 'aws-cdk-lib/assertions';
import { Cluster, KubernetesVersion } from 'aws-cdk-lib/aws-eks';
import { Karpenter } from '../src';

describe('Kubernetes ServiceAccount', () => {
  it('should create SA named: karpenter (default)', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'test-stack');

    const cluster = new Cluster(stack, 'testcluster', {
      version: KubernetesVersion.V1_27,
    });

    new Karpenter(stack, 'Karpenter', {
      cluster: cluster,
    });

    const t = Template.fromStack(stack);
    // Test if we have created a ServiceAccount
    const valueCapture = new Capture();
    t.hasResourceProperties('Custom::AWSCDK-EKS-HelmChart', {
      Values: valueCapture,
    });

    const values = valueCapture.asObject();
    expect(values['Fn::Join'][1][0]).toContain('{\"serviceAccount\":{\"create\":false,\"name\":\"karpenter\"');
  });

  it('should create SA named: custom-sa', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'test-stack');

    const cluster = new Cluster(stack, 'testcluster', {
      version: KubernetesVersion.V1_27,
    });

    new Karpenter(stack, 'Karpenter', {
      cluster: cluster,
      serviceAccountName: 'custom-sa',
    });

    const t = Template.fromStack(stack);
    // Test if we have created a ServiceAccount
    const valueCapture = new Capture();
    t.hasResourceProperties('Custom::AWSCDK-EKS-HelmChart', {
      Values: valueCapture,
    });

    const values = valueCapture.asObject();
    expect(values['Fn::Join'][1][0]).toContain('{\"serviceAccount\":{\"create\":false,\"name\":\"custom-sa\"');
  });
});
