const { awscdk, JsonPatch } = require('projen');
const { DependabotScheduleInterval } = require('projen/lib/github');

const PROJECT_NAME = 'cdk-eks-karpenter';

const project = new awscdk.AwsCdkConstructLibrary({
  author: 'Andreas Lindh',
  authorAddress: 'elindh@amazon.com',
  description: 'CDK construct library that allows you install Karpenter in an AWS EKS cluster',
  keywords: ['eks', 'karpenter'],
  cdkVersion: '2.104.0',

  majorVersion: 1,

  devDeps: [
    '@aws-cdk/lambda-layer-kubectl-v24',
    '@aws-cdk/lambda-layer-kubectl-v25',
    '@aws-cdk/lambda-layer-kubectl-v26',
    '@aws-cdk/lambda-layer-kubectl-v27',
    '@aws-cdk/lambda-layer-kubectl-v28',
    '@aws-cdk/lambda-layer-kubectl-v29',
    '@aws-cdk/lambda-layer-kubectl-v30',
    '@aws-cdk/lambda-layer-kubectl-v31',
  ],
  bundledDeps: [
    'semver',
  ],
  defaultReleaseBranch: 'main',
  name: PROJECT_NAME,
  repositoryUrl: 'https://github.com/aws-samples/cdk-eks-karpenter.git',

  pullRequestTemplateContents: [
    '---',
    '*By submitting this pull request, I confirm that my contribution is made under the terms of the Apache-2.0 license*',
  ],

  publishToPypi: {
    distName: PROJECT_NAME,
    module: 'cdk_eks_karpenter',
  },

  dependabot: true,
  dependabotOptions: {
    scheduleInterval: DependabotScheduleInterval.MONTHLY,
  },
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

project.github.actions.set('actions/download-artifact', 'actions/download-artifact@v4.1.8');
project.github.actions.set('actions/upload-artifact', 'actions/upload-artifact@v4.4.3');

// https://github.com/actions/upload-artifact/issues/602
build_workflow = project.tryFindObjectFile('.github/workflows/build.yml');
build_workflow.patch(JsonPatch.add('/jobs/build/steps/5/with/include-hidden-files', true));
build_workflow.patch(JsonPatch.add('/jobs/build/steps/8/with/include-hidden-files', true));

release_workflow = project.tryFindObjectFile('.github/workflows/release.yml');
release_workflow.patch(JsonPatch.add('/jobs/release/steps/7/with/include-hidden-files', true));

project.synth();
