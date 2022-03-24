# API Reference <a name="API Reference" id="api-reference"></a>

## Constructs <a name="Constructs" id="Constructs"></a>

### Karpenter <a name="Karpenter" id="cdk-eks-karpenter.Karpenter"></a>

#### Initializers <a name="Initializers" id="cdk-eks-karpenter.Karpenter.Initializer"></a>

```typescript
import { Karpenter } from 'cdk-eks-karpenter'

new Karpenter(scope: Construct, id: string, props: KarpenterProps)
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#cdk-eks-karpenter.Karpenter.Initializer.parameter.scope">scope</a></code> | <code>constructs.Construct</code> | *No description.* |
| <code><a href="#cdk-eks-karpenter.Karpenter.Initializer.parameter.id">id</a></code> | <code>string</code> | *No description.* |
| <code><a href="#cdk-eks-karpenter.Karpenter.Initializer.parameter.props">props</a></code> | <code><a href="#cdk-eks-karpenter.KarpenterProps">KarpenterProps</a></code> | *No description.* |

---

##### `scope`<sup>Required</sup> <a name="scope" id="cdk-eks-karpenter.Karpenter.Initializer.parameter.scope"></a>

- *Type:* constructs.Construct

---

##### `id`<sup>Required</sup> <a name="id" id="cdk-eks-karpenter.Karpenter.Initializer.parameter.id"></a>

- *Type:* string

---

##### `props`<sup>Required</sup> <a name="props" id="cdk-eks-karpenter.Karpenter.Initializer.parameter.props"></a>

- *Type:* <a href="#cdk-eks-karpenter.KarpenterProps">KarpenterProps</a>

---

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#cdk-eks-karpenter.Karpenter.toString">toString</a></code> | Returns a string representation of this construct. |
| <code><a href="#cdk-eks-karpenter.Karpenter.addProvisioner">addProvisioner</a></code> | addProvisioner adds a provisioner manifest to the cluster. |

---

##### `toString` <a name="toString" id="cdk-eks-karpenter.Karpenter.toString"></a>

```typescript
public toString(): string
```

Returns a string representation of this construct.

##### `addProvisioner` <a name="addProvisioner" id="cdk-eks-karpenter.Karpenter.addProvisioner"></a>

```typescript
public addProvisioner(id: string, provisionerSpec: {[ key: string ]: any}): void
```

addProvisioner adds a provisioner manifest to the cluster.

Currently the provisioner spec
parameter is relatively free form.

###### `id`<sup>Required</sup> <a name="id" id="cdk-eks-karpenter.Karpenter.addProvisioner.parameter.id"></a>

- *Type:* string

must consist of lower case alphanumeric characters, \'-\' or \'.\', and must start and end with an alphanumeric character.

---

###### `provisionerSpec`<sup>Required</sup> <a name="provisionerSpec" id="cdk-eks-karpenter.Karpenter.addProvisioner.parameter.provisionerSpec"></a>

- *Type:* {[ key: string ]: any}

spec of Karpenters Provisioner object.

---

#### Static Functions <a name="Static Functions" id="Static Functions"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#cdk-eks-karpenter.Karpenter.isConstruct">isConstruct</a></code> | Checks if `x` is a construct. |

---

##### ~~`isConstruct`~~ <a name="isConstruct" id="cdk-eks-karpenter.Karpenter.isConstruct"></a>

```typescript
import { Karpenter } from 'cdk-eks-karpenter'

Karpenter.isConstruct(x: any)
```

Checks if `x` is a construct.

###### `x`<sup>Required</sup> <a name="x" id="cdk-eks-karpenter.Karpenter.isConstruct.parameter.x"></a>

- *Type:* any

Any object.

---

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#cdk-eks-karpenter.Karpenter.property.node">node</a></code> | <code>constructs.Node</code> | The tree node. |
| <code><a href="#cdk-eks-karpenter.Karpenter.property.cluster">cluster</a></code> | <code>aws-cdk-lib.aws_eks.Cluster</code> | *No description.* |
| <code><a href="#cdk-eks-karpenter.Karpenter.property.namespace">namespace</a></code> | <code>string</code> | *No description.* |
| <code><a href="#cdk-eks-karpenter.Karpenter.property.nodeRole">nodeRole</a></code> | <code>aws-cdk-lib.aws_iam.Role</code> | *No description.* |
| <code><a href="#cdk-eks-karpenter.Karpenter.property.version">version</a></code> | <code>string</code> | *No description.* |

---

##### `node`<sup>Required</sup> <a name="node" id="cdk-eks-karpenter.Karpenter.property.node"></a>

```typescript
public readonly node: Node;
```

- *Type:* constructs.Node

The tree node.

---

##### `cluster`<sup>Required</sup> <a name="cluster" id="cdk-eks-karpenter.Karpenter.property.cluster"></a>

```typescript
public readonly cluster: Cluster;
```

- *Type:* aws-cdk-lib.aws_eks.Cluster

---

##### `namespace`<sup>Required</sup> <a name="namespace" id="cdk-eks-karpenter.Karpenter.property.namespace"></a>

```typescript
public readonly namespace: string;
```

- *Type:* string

---

##### `nodeRole`<sup>Required</sup> <a name="nodeRole" id="cdk-eks-karpenter.Karpenter.property.nodeRole"></a>

```typescript
public readonly nodeRole: Role;
```

- *Type:* aws-cdk-lib.aws_iam.Role

---

##### `version`<sup>Optional</sup> <a name="version" id="cdk-eks-karpenter.Karpenter.property.version"></a>

```typescript
public readonly version: string;
```

- *Type:* string

---


## Structs <a name="Structs" id="Structs"></a>

### KarpenterProps <a name="KarpenterProps" id="cdk-eks-karpenter.KarpenterProps"></a>

#### Initializer <a name="Initializer" id="cdk-eks-karpenter.KarpenterProps.Initializer"></a>

```typescript
import { KarpenterProps } from 'cdk-eks-karpenter'

const karpenterProps: KarpenterProps = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#cdk-eks-karpenter.KarpenterProps.property.cluster">cluster</a></code> | <code>aws-cdk-lib.aws_eks.Cluster</code> | The EKS Cluster to attach to. |
| <code><a href="#cdk-eks-karpenter.KarpenterProps.property.namespace">namespace</a></code> | <code>string</code> | The Kubernetes namespace to install to. |
| <code><a href="#cdk-eks-karpenter.KarpenterProps.property.version">version</a></code> | <code>string</code> | The helm chart version to install. |

---

##### `cluster`<sup>Required</sup> <a name="cluster" id="cdk-eks-karpenter.KarpenterProps.property.cluster"></a>

```typescript
public readonly cluster: Cluster;
```

- *Type:* aws-cdk-lib.aws_eks.Cluster

The EKS Cluster to attach to.

---

##### `namespace`<sup>Optional</sup> <a name="namespace" id="cdk-eks-karpenter.KarpenterProps.property.namespace"></a>

```typescript
public readonly namespace: string;
```

- *Type:* string
- *Default:* karpenter

The Kubernetes namespace to install to.

---

##### `version`<sup>Optional</sup> <a name="version" id="cdk-eks-karpenter.KarpenterProps.property.version"></a>

```typescript
public readonly version: string;
```

- *Type:* string
- *Default:* latest

The helm chart version to install.

---



