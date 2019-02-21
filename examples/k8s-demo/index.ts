import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import { config } from "./config";

// Create Kubernetes Pulumi provider
const provider = new k8s.Provider("eks-k8s", {
    kubeconfig: config.kubeconfig.apply(JSON.stringify),
});

// Create app labels
const appLabels = { app: config.name };

// Create a Namespace
const appNamespace = new k8s.core.v1.Namespace(
    config.namespace,
    undefined,
    {
        provider: provider,
    }
);

let appNamespaceName = appNamespace.metadata.apply(m => m.name);

// Create a k8s-demo Service
const svc = new k8s.core.v1.Service(config.name,
    {
        metadata: {
            labels: appLabels,
            namespace: appNamespaceName,
        },
        spec: {
            ports: [{ port: 80, targetPort: "http" }],
            selector: appLabels,
        },
    },
    {
        provider: provider,
    }
);

// Export the Service name
export let appServiceName = svc.metadata.apply(m => m.name);

// Create a k8s-demo Deployment
const deploy = new k8s.apps.v1.Deployment(config.name,
    {
        metadata: {
            labels: appLabels,
            namespace: appNamespaceName,
        },
        spec: {
            replicas: 1,
            selector: { matchLabels: appLabels },
            template: {
                metadata: {
                    labels: appLabels,
                },
                spec: {
                    containers: [
                        {
                            name: config.name,
                            image: config.image,
                            imagePullPolicy: "Always",
                            ports: [{ name: "http", containerPort: 8080 }]
                        }
                    ],
                }
            }
        }
    },
    {
        provider: provider,
    }
);

// Export the Deployment name
export let appDeploymentName = deploy.metadata.apply(m => m.name);

// Create a k8s-demo Ingress
const ing = new k8s.extensions.v1beta1.Ingress(config.name,
    {
        metadata: {
            labels: appLabels,
            namespace: appNamespaceName,
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
                                    serviceName: appServiceName,
                                    servicePort: "http",
                                }
                            },
                        ],
                    },
                }
            ]
        }
    },
    {
        provider: provider,
    }
);

// Export the Ingress Name and Address
export let appIngressName = ing.metadata.apply(m => m.name)
//export let appIngressHost = ing.spec.apply(s => s.rules[0]
export let appIngressHostname = ing.status.apply(status => status.loadBalancer.ingress[0].hostname)

// curl Command
// Export the curl command to hit the ingress endpoint for the k8s-demo
export let appFullCurlCommand = pulumi.concat("curl -v -H 'Host: ", config.hostname, "' http://", appIngressHostname, "/foobar")
export let appCurlCommand = pulumi.concat("curl -v ", config.hostname, "/foobar")
