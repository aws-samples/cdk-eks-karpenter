# cdk-eks-karpenter

This construct configures the necessary dependencies and installs [Karpenter](https://karpenter.sh)
on an EKS cluster managed by AWS CDK.

## Prerequisites

### Usage with EC2 Spot Capacity

If you have not used EC2 spot in your AWS account before, follow the instructions
[here](https://karpenter.sh/v0.31/getting-started/getting-started-with-karpenter/#3-create-a-cluster) to create
the service linked role in your account allowing Karpenter to provision EC2 Spot Capacity.

## Using

In your CDK project, initialize a new Karpenter construct for your EKS cluster, like this:

```typescript
const cluster = new Cluster(this, 'testCluster', {
  vpc: vpc,
  role: clusterRole,
  version: KubernetesVersion.V1_27,
  defaultCapacity: 1
});

const karpenter = new Karpenter(this, 'Karpenter', {
  cluster: cluster
});
```

This will install and configure Karpenter in your cluster. To have Karpenter do something useful, you
also need to create an [EC2NodeClass](https://karpenter.sh/docs/concepts/nodeclasses/) and an
[NodePool](https://karpenter.sh/docs/concepts/nodepools/), for a more complete example, see
[test/integ.karpenter.ts](./test/integ.karpenter.ts).

## Known issues

### Versions earlier than v0.6.1 fails to install

As of [aws/karpenter#1145](https://github.com/aws/karpenter/pull/1145) the Karpenter Helm chart is
refactored to specify `clusterEndpoint` and `clusterName` on the root level of the chart values, previously
these values was specified under the key `controller`.

## Testing

This construct adds a custom task to [projen](https://projen.io/), so you can test a full deployment
of an EKS cluster with Karpenter installed as specified in `test/integ.karpenter.ts` by running the
following:

```sh
export CDK_DEFAULT_REGION=<aws region>
export CDK_DEFAULT_ACCOUNT=<account id>
npx projen test:deploy
```

As the above will create a cluster without EC2 capacity, with CoreDNS and Karpenter running as Fargate
pods, you can test out the functionality of Karpenter by deploying an inflation deployment, which will
spin up a number of pods that will trigger Karpenter creation of worker nodes:

```sh
kubectl apply -f test/inflater-deployment.yml
```

You can clean things up by deleting the deployment and the CDK test stack:

```sh
kubectl delete -f test/inflater-deployment.yml
npx projen test:destroy
```

## FAQ

### I'm not able to launch spot instances

1. Ensure you have the appropriate linked role available in your account, for more details,
  see [the karpenter documentation](https://karpenter.sh/v0.31/getting-started/getting-started-with-karpenter/#3-create-a-cluster)
