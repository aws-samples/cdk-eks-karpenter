import * as cdk from 'aws-cdk-lib';
import { Capture, Template } from 'aws-cdk-lib/assertions';
import { Cluster, KubernetesVersion } from 'aws-cdk-lib/aws-eks';
import { Karpenter } from '../src';

describe('Helm settings', () => {
  it('featureGates: spotToSpotConsolidation', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'test-stack');

    const cluster = new Cluster(stack, 'testcluster', {
      version: KubernetesVersion.V1_27,
    });

    new Karpenter(stack, 'Karpenter', {
      cluster: cluster,
      version: '1.1.1',
      helmExtraValues: {
        settings: {
          featureGates: {
            spotToSpotConsolidation: true,
          },
        },
      },
    });

    const t = Template.fromStack(stack);
    const valueCapture = new Capture();
    t.hasResourceProperties('Custom::AWSCDK-EKS-HelmChart', {
      Values: valueCapture,
    });
    const values = valueCapture.asObject();
    expect(values['Fn::Join'][1][2]).toContain('\"spotToSpotConsolidation\":true');
  });
});
