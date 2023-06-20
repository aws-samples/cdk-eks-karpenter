import * as cdk from 'aws-cdk-lib';
import { Match, Template, Capture } from 'aws-cdk-lib/assertions';
import { Cluster, KubernetesVersion } from 'aws-cdk-lib/aws-eks';
import { Role, ServicePrincipal, PolicyDocument, ManagedPolicy } from 'aws-cdk-lib/aws-iam';
import { Karpenter } from '../src';

describe('Karpenter installation', () => {
  it('should install the latest version by default', () => {
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

  it('should add extra helm values if provided', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'test-stack');

    const cluster = new Cluster(stack, 'testcluster', {
      version: KubernetesVersion.V1_24,
    });

    // Create Karpenter install with extra values
    new Karpenter(stack, 'Karpenter', {
      cluster: cluster,
      namespace: 'kar-penter',
      helmExtraValues: {
        'foo.key': 'foo.value',
      },
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

  it('should install from old URL if Karpenter version < v0.17.0', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'test-stack');

    const cluster = new Cluster(stack, 'testcluster', {
      version: KubernetesVersion.V1_23,
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

  it('should use existing nodeRole instead of creating a new role', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'test-stack');

    const cluster = new Cluster(stack, 'testcluster', {
      version: KubernetesVersion.V1_24,
    });

    const preexistingRole = new Role(stack, 'PreExistingRole', {
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
      description: 'Example role...',
    });

    // Create Karpenter install with non-default version
    new Karpenter(stack, 'Karpenter', {
      cluster: cluster,
      nodeRole: preexistingRole,
    });

    const t = Template.fromStack(stack);
    t.hasResource('Custom::AWSCDK-EKS-Cluster', {});
    t.resourceCountIs('AWS::IAM::Role', 8);
    t.hasResourceProperties('AWS::IAM::InstanceProfile', {
      Roles: Match.arrayWith( [
        Match.objectLike({
          Ref: Match.stringLikeRegexp('^.*PreExistingRole.*$'),
        }),
      ]),
    });
  });

  it('should be able to add managed policies to Karpenter Role', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'test-stack');

    const cluster = new Cluster(stack, 'testcluster', {
      version: KubernetesVersion.V1_24,
    });

    // Create Karpenter install with non-default version
    const karpenter = new Karpenter(stack, 'Karpenter', {
      cluster: cluster,
    });

    const policyDocument = {
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'Statement',
          Effect: 'Allow',
          Action: 's3:ListAllMyBuckets',
          Resource: '*',
        },
      ],
    };

    const customPolicyDocument = PolicyDocument.fromJson(policyDocument);

    const newManagedPolicy = new ManagedPolicy(stack, 'MyNewManagedPolicy', {
      document: customPolicyDocument,
    });

    karpenter.addManagedPolicyToKarpenterRole(newManagedPolicy);

    karpenter.addManagedPolicyToKarpenterRole(ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'));

    const t = Template.fromStack(stack);
    // Test if we have created the managed policy correctly.
    t.hasResource('AWS::IAM::ManagedPolicy', {
      Properties: {
        PolicyDocument: policyDocument,
        Description: '',
        Path: '/',
      },
    });

    // Test if the managed policy is attached to the Karpenter role
    t.hasResourceProperties('AWS::IAM::Role', Match.objectLike({
      ManagedPolicyArns: Match.arrayWith([
        Match.objectEquals({
          Ref: Match.stringLikeRegexp('^MyNewManagedPolicy.*$'),
        }),
      ]),
    }));
  });

  it('should install from new URL if Karpenter version >= v0.17.0', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'test-stack');

    const cluster = new Cluster(stack, 'testcluster', {
      version: KubernetesVersion.V1_23,
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

  it('should use new Values if Karpenter version >= v0.19.0', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'test-stack');

    const cluster = new Cluster(stack, 'testcluster', {
      version: KubernetesVersion.V1_23,
    });

    // Create Karpenter install with non-default version
    new Karpenter(stack, 'Karpenter', {
      cluster: cluster,
      version: 'v0.19.1',
    });

    const t = Template.fromStack(stack);
    const valueCapture = new Capture();
    t.hasResource('Custom::AWSCDK-EKS-Cluster', {});
    t.hasResourceProperties('Custom::AWSCDK-EKS-HelmChart', {
      Values: valueCapture,
    });

    const values = valueCapture.asObject();

    expect(values['Fn::Join'][1]).toContain('\"}},\"settings\":{\"aws\":{\"clusterName\":\"');
  });
});
