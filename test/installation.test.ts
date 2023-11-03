import * as cdk from 'aws-cdk-lib';
import { Template, Capture } from 'aws-cdk-lib/assertions';
import { Cluster, KubernetesVersion } from 'aws-cdk-lib/aws-eks';
import { Karpenter } from '../src';

describe('Karpenter installation', () => {
  it('should install the desired version', () => {
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
      Version: 'v0.6.0',
    });
  });

  it('should install in a different namespace', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'test-stack');

    const cluster = new Cluster(stack, 'testcluster', {
      version: KubernetesVersion.V1_27,
    });

    // Create Karpenter install with non-default namespace
    new Karpenter(stack, 'Karpenter', {
      cluster: cluster,
      namespace: 'kar-penter',
      version: 'v0.32.0',
    });

    const t = Template.fromStack(stack);
    t.hasResource('Custom::AWSCDK-EKS-Cluster', {});
    t.hasResourceProperties('Custom::AWSCDK-EKS-HelmChart', {
      Namespace: 'kar-penter',
    });
  });

  it('should add extra helm values if provided', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'test-stack');

    const cluster = new Cluster(stack, 'testcluster', {
      version: KubernetesVersion.V1_27,
    });

    // Create Karpenter install with extra values
    new Karpenter(stack, 'Karpenter', {
      cluster: cluster,
      namespace: 'kar-penter',
      helmExtraValues: {
        'foo.key': 'foo.value',
      },
      version: 'v0.32.0',
    });

    const t = Template.fromStack(stack);
    const valueCapture = new Capture();
    t.hasResource('Custom::AWSCDK-EKS-Cluster', {});
    t.hasResourceProperties('Custom::AWSCDK-EKS-HelmChart', {
      Values: valueCapture,
      Namespace: 'kar-penter',
    });

    const values = valueCapture.asObject();
    expect(values['Fn::Join'][1][0]).toContain('{\"foo.key\":\"foo.value\"');
  });

  it('EC2NodeClass should fail invalid name with correct properties', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'test-stack');

    const cluster = new Cluster(stack, 'testcluster', {
      version: KubernetesVersion.V1_27,
    });

    const karpenter = new Karpenter(stack, 'Karpenter', {
      cluster: cluster,
      version: 'v0.32.0',
    });

    expect(
      () => karpenter.addEC2NodeClass('ec2NODECLASSINVALID', {
        amiFamily: 'AL2',
        subnetSelectorTerms: [
          {
            tags: {
              Name: 'sometagvalue',
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
      }),
    ).toThrowError();
  });

  it('EC2NodeClass should accept valid name and valid properties', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'test-stack');

    const cluster = new Cluster(stack, 'testcluster', {
      version: KubernetesVersion.V1_27,
    });

    const karpenter = new Karpenter(stack, 'Karpenter', {
      cluster: cluster,
      version: 'v0.32.0',
    });

    expect(
      () => karpenter.addEC2NodeClass('ec2nodeclassvalid', {
        amiFamily: 'AL2',
        subnetSelectorTerms: [
          {
            tags: {
              Name: 'something',
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
      }),
    ).not.toThrowError();
  });

  it('EC2NodeClass should fail on invalid properties', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'test-stack');

    const cluster = new Cluster(stack, 'testcluster', {
      version: KubernetesVersion.V1_27,
    });

    const karpenter = new Karpenter(stack, 'Karpenter', {
      cluster: cluster,
      version: 'v0.32.0',
    });

    expect(
      () => karpenter.addEC2NodeClass('ec2nodeclassvalid', {
        // amiFamily missing here
        subnetSelectorTerms: [
          {
            tags: {
              Name: 'something',
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
      }),
    ).toThrowError();
  });

  it('NodePool should fail on invalid name and correct properties', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'test-stack');

    const cluster = new Cluster(stack, 'testcluster', {
      version: KubernetesVersion.V1_27,
    });

    const karpenter = new Karpenter(stack, 'Karpenter', {
      cluster: cluster,
      version: 'v0.32.0',
    });

    expect(
      () => karpenter.addNodePool('NodEPoooolInvalid', {
        template: {
          spec: {
            nodeClassRef: {
              apiVersion: 'karpenter.k8s.aws/v1beta1',
              kind: 'EC2NodeClass',
              name: 'nodeclassname',
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
      }),
    ).toThrowError();
  });

  it('NodePool should accept correct name and properties', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'test-stack');

    const cluster = new Cluster(stack, 'testcluster', {
      version: KubernetesVersion.V1_27,
    });

    const karpenter = new Karpenter(stack, 'Karpenter', {
      cluster: cluster,
      version: 'v0.32.0',
    });

    expect(
      () => karpenter.addNodePool('nodepoolname', {
        template: {
          spec: {
            nodeClassRef: {
              apiVersion: 'karpenter.k8s.aws/v1beta1',
              kind: 'EC2NodeClass',
              name: 'nodeclassname',
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
      }),
    ).not.toThrowError();
  });

  it('NodePool should fail on valid name but invalid properties', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'test-stack');

    const cluster = new Cluster(stack, 'testcluster', {
      version: KubernetesVersion.V1_27,
    });

    const karpenter = new Karpenter(stack, 'Karpenter', {
      cluster: cluster,
      version: 'v0.32.0',
    });

    expect(
      () => karpenter.addNodePool('nodepoolname', {
        template: {
          spec: {
            nodeClassRef: {
              apiVersion: 'karpenter.k8s.aws/v1beta1',
              kind: 'EC2NodeClass',
              name: 'nodeclassname',
            },
            // requirements key missing here
          },
        },
      }),
    ).toThrowError();
  });
});
