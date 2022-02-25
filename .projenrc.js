const { awscdk } = require('projen');
const project = new awscdk.AwsCdkConstructLibrary({
  author: 'Andreas Lindh',
  authorAddress: 'elindh@amazon.com',
  description: 'CDK construct library that allows you install Karpenter in an AWS EKS cluster',
  cdkVersion: '2.12.0',
  defaultReleaseBranch: 'main',
  name: 'cdk-eks-karpenter',
  repositoryUrl: 'https://github.com/aws-samples/cdk-eks-karpenter.git',

  pullRequestTemplateContents: [
    '---',
    '*By submitting this pull request, I confirm that my contribution is made under the terms of the Apache-2.0 license*'
  ]
});

const common_excludes = [
  'cdk.out/',
  'cdk.context.json',
  '.env',
];
project.gitignore.exclude(...common_excludes);
project.npmignore.exclude(...common_excludes);

project.addTask('test:deploy', {
  exec: 'npx cdk deploy -a "npx ts-node -P tsconfig.dev.json --prefer-ts-exts test/integ.karpenter.ts"',
});
project.addTask('test:destroy', {
  exec: 'npx cdk destroy -a "npx ts-node -P tsconfig.dev.json --prefer-ts-exts test/integ.karpenter.ts"',
});
project.addTask('test:synth', {
  exec: 'npx cdk synth -a "npx ts-node -P tsconfig.dev.json --prefer-ts-exts test/integ.karpenter.ts"',
});

project.synth();