import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { Cluster, KubernetesVersion } from 'aws-cdk-lib/aws-eks';
import { Role, ServicePrincipal, PolicyDocument, ManagedPolicy } from 'aws-cdk-lib/aws-iam';
import { Karpenter } from '../src';

describe('Karpenter installation', () => {
  it('should use existing nodeRole instead of creating a new role', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'test-stack');

    const cluster = new Cluster(stack, 'testcluster', {
      version: KubernetesVersion.V1_27,
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
      version: KubernetesVersion.V1_27,
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
});