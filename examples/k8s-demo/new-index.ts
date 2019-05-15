import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import * as kx from "../../nodejs/kx";
import { config } from "./config";

// Create Kubernetes Pulumi provider
const provider = new k8s.Provider("kx-k8s-demo", {
    kubeconfig: config.kubeconfig.apply(JSON.stringify),
});

// Create a Namespace
const namespace = new k8s.core.v1.Namespace(
    config.namespace,
    undefined,
    {provider: provider}
);
let namespaceName = namespace.metadata.apply(m => m.name);

// Create a ConfigMap to hold env variables.
const configMap = new k8s.core.v1.ConfigMap(
    config.name,
    {
        metadata: {
            labels: { app: config.name },
            namespace: namespaceName,
        },
        data: {
            "MY_FOO": "bar",
        },
    },
    { provider: provider},
);
const configMapName = configMap.metadata.apply(m => m.name);

// Create a k8s-demo Service
const svc = new k8s.core.v1.Service(config.name, {
    metadata: {
        labels: { app: config.name },
        namespace: namespaceName,
    },
    spec: {
        ports: [{ port: 80, targetPort: "http" }],
        selector: { app: config.name },
    },
},
    {provider: provider}
);

// Export the Service name
export let serviceName = svc.metadata.apply(m => m.name);

// Define the Deployment Pod args.
// PodBuilder automatically mounts k8s downwardAPI envvars & file paths in Pod
const podBuilder = new kx.PodBuilder(config.name, provider, {
    podSpec: {
        containers: [{
            name: config.name,
            image: config.image,
            ports: [{ name: "http", containerPort: 8080 }],
            resources: {
                limits: {cpu: "256m", memory: "256Mi"},
                requests: { cpu: "256m", memory: "256Mi"},
            }
        }],
    },
})
    .withMetadata({
        labels: { app: config.name },
        namespace: namespaceName,
    })
    .addEnvVarsFromConfigMap(configMapName)
    .addImagePullSecrets(config.dockerConfigJson)
    .mountVolume(
        "/host/proc",
        {
            name: "proc",
            hostPath: {path: "/proc"},
        })

// Create the Deployment.
const deployment = podBuilder.createDeployment(config.name, { replicas: 1 });

// Export the Deployment name
export let deploymentName = deployment.metadata.apply(m => m.name);

// Create a k8s-demo Ingress
const ing = new k8s.extensions.v1beta1.Ingress(config.name,
    {
        metadata: {
            labels: { app: config.name },
            namespace: namespaceName,
            annotations: {
                "kubernetes.io/ingress.class": config.nginxIngressClass,
            },
        },
        spec: {
            rules: [
                {
                    host: config.hostname,
                    http: {
                        paths: [
                            {
                                path: "/foobar",
                                backend: {
                                    serviceName: serviceName,
                                    servicePort: "http",
                                }
                            },
                        ],
                    },
                }
            ]
        }
    },
    {provider: provider}
);
export let curlCommand = pulumi.concat("curl -v ", config.hostname, "/foobar")
