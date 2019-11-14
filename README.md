> Note: This library is under active development and subject to change. Not yet recommended
for production workloads.

# Pulumi Kubernetes Extensions

_Kubernetes for Everyone_

Using the Kubernetes API today often feels heavy and repetitive. Many of the API
fields are deeply nested and require users to specify the same values over and
over across different resources. While this input is necessary for Kubernetes to
operate, it’s not very friendly to the people writing it.

The Kubernetes Extensions (`kx`) library for Pulumi is designed to simplify the 
declaration of Kubernetes resources, and make the API easier for everyone to use. 

1. **Sane Defaults** - Less boilerplate and easier to use. Common configurations
   require minimal code.
1. **Improved Authorship Experience** - Simplified syntax for declaring and
   composing Kubernetes resources. Reference objects rather than juggling string
   references across resources.
1. **Idiomatic Kubernetes** - We don't reinvent the wheel; no new API resources
   to learn. We make the existing APIs easier to use while still providing
   the full API for production use cases.
   
The `kx` library takes full advantage of being defined in TypeScript, not in YAML.
This enables the use of functions, overloading, type-checking, and many other 
richer API design tools than are available using YAML or Helm.

If you are just getting started with Pulumi and Kubernetes, the 
[Pulumi Kubernetes](https://www.pulumi.com/docs/intro/cloud-providers/kubernetes/)
introduction is a good place to start.

| kx                                     | raw provider                                      |
| :------------------------------------: | :-----------------------------------------------: |
| ![kx example](./images/kx-example.png) | ![raw provider example](./images/raw-example.png) |

![kx-up](./images/kx-up.gif)

## Installation

This package is available in JavaScript/TypeScript for use with Node.js.  Install it using either `npm`:

    $ npm install @pulumi/kubernetesx

or `yarn`:

    $ yarn add @pulumi/kubernetesx

## Usage Examples

### Define a Pod

Use the `PodBuilder` class to define a PodSpec that can be used by other kx classes
that include a PodSpec (Pod, Deployment, StatefulSet, DaemonSet, ReplicaSet).

```typescript
const pb = new kx.PodBuilder({
    containers: [{
        // name is not required. If not provided, it is inferred from the image.
        image: "nginx",
        ports: {http: 80}, // Simplified ports syntax.
    }]
});
```

Note that a `PodBuilder` does not create a k8s resource; it is a convenience class
for defining a PodSpec that can be easily composed with other kx resources.

```typescript
// Define the PodSpec.
const pb = new kx.PodBuilder({
    containers: [{image: "nginx"}]
});
// Create a Pod resource using the PodBuilder.
new kx.Pod("nginx", {
    spec: pb
});
```

### Create a Deployment

Using a `PodBuilder` class to define the workload Pod, create a Deployment
resource. Instantiating the `kx.Deployment` class will cause Pulumi to create
a matching `Deployment` resource in your Kubernetes cluster on the next `pulumi up`.

```typescript
const pb = new kx.PodBuilder(...);
const deployment = new kx.Deployment("app", {
    // asDeploymentSpec() takes parameters corresponding 
    // to a DeploymentSpec (e.g., replicas).
    spec: pb.asDeploymentSpec({ replicas: 3 }) 
});
```

Note that you can still define the DeploymentSpec explicitly, but would be
responsible for defining required fields (labels/selectors, etc.) as usual.
This still benefits from the enhanced kx syntax for `env`, `ports`, 
`volumeMounts`, and resource composability.

```typescript
const deployment = new kx.Deployment("app", {
    spec: {
        selector: {
            matchLabels: {
                app: "my-app",
            }
        },
        replicas: 3,
        template: {
            metadata: {
                labels: {
                    app: "my-app",
                }
            },
            spec: {
                containers: [{
                    image: "nginx",
                    ports: {http: 80},
                }]
            }
        }
    }
});
```

### Create a ClusterIP Service from the Deployment

Easily create a Service from a workload using the `createService` verb.

```typescript
const deployment = new kx.Deployment(...);
const service = deployment.createService();
```

### Add a PersistentVolumeClaim to a Pod

Use the `mount` verb on a PersistentVolumeClaim to add it to a Pod under the
`volumeMounts` field. The `PodBuilder` automatically creates the corresponding
`volume` and naming boilerplate.

```typescript
const pvc = new kx.PersistentVolumeClaim("data", {
    spec: {
        accessModes: [ "ReadWriteOnce" ],
        resources: { requests: { storage: "1Gi" } }
    }
});
const pb = new kx.PodBuilder({
    containers: [{
        image: "nginx",
        ports: {http: 80},
        volumeMounts: [ pvc.mount("/data") ],
    }]
});
```

### Create Environment Variables from a ConfigMap and Secret

Use the `asEnvValue` verb on ConfigMap and Secret resources to add them to the Pod
under the `env` field. The `PodBuilder` automatically creates the relevant boilerplate
depending on the resource type.

```typescript
const cm = new kx.ConfigMap("cm", {
    data: { "config": "very important data" }
});
const secret = new kx.Secret("secret", {
    stringData: { "password": new random.RandomPassword("password", { length: 12 }).result }
});
const pb = new kx.PodBuilder({
    containers: [{
        env: {
            DATA: cm.asEnvValue("config"),
            PASSWORD: secret.asEnvValue("password"),
        },
        image: "nginx",
        ports: {http: 80},
    }]
});
```

## Learn more about Pulumi

[Intro to Pulumi](https://www.pulumi.com/docs/intro/)

[Get Started with Kubernetes](https://www.pulumi.com/docs/get-started/kubernetes/)

[Crosswalk for Kubernetes](https://www.pulumi.com/docs/guides/crosswalk/kubernetes)

[Pulumi: A Better Way to Kubernetes](https://www.pulumi.com/blog/pulumi-a-better-way-to-kubernetes/)

[Pulumi's YouTube Channel](https://www.youtube.com/channel/UC2Dhyn4Ev52YSbcpfnfP0Mw)
