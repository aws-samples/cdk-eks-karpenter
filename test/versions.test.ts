import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { Cluster, KubernetesVersion } from 'aws-cdk-lib/aws-eks';
import { Karpenter } from '../src';

describe('Karpenter Versions', () => {
  it('should install from old URL if Karpenter version < v0.17.0', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'test-stack');

    const cluster = new Cluster(stack, 'testcluster', {
      version: KubernetesVersion.V1_27,
    });

    // Create Karpenter install with non-default version
    new Karpenter(stack, 'Karpenter', {
      cluster: cluster,
      version: 'v0.6.0',
    });

    const t = Template.fromStack(stack);
    t.hasResource('Custom::AWSCDK-EKS-Cluster', {});
    t.hasResourceProperties('Custom::AWSCDK-EKS-HelmChart', {
      Repository: Match.stringLikeRegexp('https://charts.karpenter.sh'),
    });
  });

  it('should install from new URL if Karpenter version >= v0.17.0', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'test-stack');

    const cluster = new Cluster(stack, 'testcluster', {
      version: KubernetesVersion.V1_27,
    });

    // Create Karpenter install with non-default version
    new Karpenter(stack, 'Karpenter', {
      cluster: cluster,
      version: 'v0.17.0',
    });

    const t = Template.fromStack(stack);
    t.hasResource('Custom::AWSCDK-EKS-Cluster', {});
    t.hasResourceProperties('Custom::AWSCDK-EKS-HelmChart', {
      Repository: Match.stringLikeRegexp('oci://public.ecr.aws/karpenter/karpenter'),
    });
  });

  it('should use helm settings for Karpenter between version v0.19.0 and v0.32.0', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'test-stack');

    const cluster = new Cluster(stack, 'testcluster', {
      version: KubernetesVersion.V1_27,
    });

    // Create Karpenter install with non-default version
    const karpenter = new Karpenter(stack, 'Karpenter', {
      cluster: cluster,
      version: 'v0.19.1',
    });

    const t = Template.fromStack(stack);
    t.hasResource('Custom::AWSCDK-EKS-Cluster', {});
    t.hasResource('Custom::AWSCDK-EKS-HelmChart', {});

    expect(karpenter.helmChartValues).toEqual(
      expect.objectContaining({
        settings: expect.objectContaining({
          aws: expect.objectContaining({
            clusterName: expect.any(String),
            clusterEndpoint: expect.any(String),
          }),
        }),
      }),
    );
  });

  it('should throw an exception for Karpenter >=v0.32.0 and addNodeTemplate()', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'test-stack');

    const cluster = new Cluster(stack, 'testcluster', {
      version: KubernetesVersion.V1_27,
    });

    const karpenter = new Karpenter(stack, 'Karpenter', {
      cluster: cluster,
      serviceAccountName: 'custom-sa',
      version: 'v0.32.0',
    });

    expect(
      () => karpenter.addNodeTemplate('test', {}),
    ).toThrowError();
  });

  it('should throw an exception for Karpenter >=v0.32.0 and addProvisioner()', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'test-stack');

    const cluster = new Cluster(stack, 'testcluster', {
      version: KubernetesVersion.V1_27,
    });

    const karpenter = new Karpenter(stack, 'Karpenter', {
      cluster: cluster,
      serviceAccountName: 'custom-sa',
      version: 'v0.32.0',
    });

    expect(
      () => karpenter.addProvisioner('test', {}),
    ).toThrowError();
  });

  it('should allow for creation of v1beta1 APIs', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'test-stack');

    const cluster = new Cluster(stack, 'testcluster', {
      version: KubernetesVersion.V1_27,
    });

    const karpenter = new Karpenter(stack, 'Karpenter', {
      cluster: cluster,
      serviceAccountName: 'custom-sa',
      version: 'v0.32.0',
    });

    const nodeClass = karpenter.addEC2NodeClass('ec2nodeclass', {
      amiFamily: 'AL2',
      subnetSelectorTerms: [],
      securityGroupSelectorTerms: [],
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
          ],
        },
      },
    });

    const t = Template.fromStack(stack);

    // EC2NodeClass manifest
    t.hasResourceProperties('Custom::AWSCDK-EKS-KubernetesResource', Match.objectLike({
      Manifest: Match.objectLike({
        'Fn::Join': [
          '',
          Match.arrayWith([
            Match.stringLikeRegexp('\"apiVersion\":\"karpenter.k8s.aws\/v1beta1\",\"kind\":\"EC2NodeClass\",\"metadata\":{\"name\":\"ec2nodeclass\",\"namespace\":\"karpenter\"'),
          ]),
        ],
      }),
    }));

    // NodePool manifest
    t.hasResourceProperties('Custom::AWSCDK-EKS-KubernetesResource', Match.objectLike({
      Manifest: Match.stringLikeRegexp('\"apiVersion\":\"karpenter.sh\/v1beta1\",\"kind\":\"NodePool\",\"metadata\":{\"name\":\"nodepool\",\"namespace\":\"karpenter\"'),
    }));
  });

  it('should use correct helm values for if >= v0.32.0', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'test-stack');

    const cluster = new Cluster(stack, 'testcluster', {
      version: KubernetesVersion.V1_27,
    });

    const karpenter = new Karpenter(stack, 'Karpenter', {
      cluster: cluster,
      version: 'v0.32.0',
    });

    expect(karpenter.helmChartValues).not.toContain(
      expect.objectContaining({
        aws: expect.anything,
      }),
    );
    expect(karpenter.helmChartValues).toEqual(
      expect.objectContaining({
        settings: expect.objectContaining({
          clusterName: expect.any(String),
          clusterEndpoint: expect.any(String),
          interruptionQueue: expect.any(String),
        }),
      }),
    );
  });
});