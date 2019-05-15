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

// Create a Secret to hold env variables.
const dockerConfigJson = config.dockerConfigJson;
console.log(dockerConfigJson);
const imagePullSecret = new k8s.core.v1.Secret(
    config.name,
    {
        type: "kubernetes.io/dockerconfigjson",
        metadata: {
            labels: { app: config.name },
            namespace: namespaceName,
        },
        data: {
            ".dockerconfigjson": dockerConfigJson,
        },
    },
    { provider: provider},
);
let imagePullSecretName = imagePullSecret.metadata.apply(m => m.name);

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
    { provider: provider}
);

// Export the Service name
export let serviceName = svc.metadata.apply(m => m.name);

const deployment = new k8s.apps.v1.Deployment(config.name,
    {
        metadata: {
            labels: { app: config.name },
            namespace: namespaceName,
        },
        spec: {
            replicas: 1,
            selector: { matchLabels:{ app: config.name }},
            template: {
                metadata: {
                    labels: { app: config.name },
                },
                spec: {
                    imagePullSecrets: [{ name: imagePullSecretName}],
                    volumes: [{
                        name: "podinfo",
                        downwardAPI: {
                            items: [
                                {
                                    path: "metadata.name",
                                    fieldRef: {
                                        fieldPath: "metadata.name",
                                    },
                                },
                                {
                                    path: "metadata.namespace",
                                    fieldRef: {
                                        fieldPath: "metadata.namespace",
                                    },
                                },
                                {
                                    path: "metadata.uid",
                                    fieldRef: {
                                        fieldPath: "metadata.uid",
                                    },
                                },
                                {
                                    path: "metadata.labels",
                                    fieldRef: {
                                        fieldPath: "metadata.labels",
                                    },
                                },
                                {
                                    path: "metadata.annotations",
                                    fieldRef: {
                                        fieldPath: "metadata.annotations",
                                    },
                                },
                            ],
                        },
                    }],
                    containers: [
                        {
                            name: config.name,
                            image: config.image,
                            imagePullPolicy: "Always",
                            ports: [{ name: "http", containerPort: 8080 }],
                            env: [
                                {
                                    name: "MY_FOO",
                                    valueFrom: { 
                                        configMapKeyRef: {
                                            name: configMapName,
                                            key: "MY_FOO",
                                        },
                                    }
                                },
                                {
                                    name: "SPEC_NODE_NAME",
                                    valueFrom: {
                                        fieldRef: {
                                            fieldPath: "spec.nodeName",
                                        },
                                    },
                                },
                                {
                                    name: "SPEC_SERVICE_ACCOUNT_NAME",
                                    valueFrom: {
                                        fieldRef: {
                                            fieldPath: "spec.serviceAccountName",
                                        },
                                    },
                                },
                                {
                                    name: "STATUS_HOST_IP",
                                    valueFrom: {
                                        fieldRef: {
                                            fieldPath: "status.hostIP",
                                        },
                                    },
                                },
                                {
                                    name: "STATUS_POD_IP",
                                    valueFrom: {
                                        fieldRef: {
                                            fieldPath: "status.podIP",
                                        },
                                    },
                                },
                                {
                                    name: "METADATA_NAME",
                                    valueFrom: {
                                        fieldRef: {
                                            fieldPath: "metadata.name",
                                        },
                                    },
                                },
                                {
                                    name: "METADATA_NAMESPACE",
                                    valueFrom: {
                                        fieldRef: {
                                            fieldPath: "metadata.namespace",
                                        },
                                    },
                                },
                                {   // Alias for METADATA_NAME. Commonly used by k8s apps.
                                    name: "POD_NAME",
                                    valueFrom: {
                                        fieldRef: {
                                            fieldPath: "metadata.name",
                                        },
                                    },
                                },
                                {   // Alias for METADATA_NAMESPACE. Commonly used by k8s apps.
                                    name: "POD_NAMESPACE",
                                    valueFrom: {
                                        fieldRef: {
                                            fieldPath: "metadata.namespace",
                                        },
                                    },
                                },
                                {
                                    name: "METADATA_UID",
                                    valueFrom: {
                                        fieldRef: {
                                            fieldPath: "metadata.uid",
                                        },
                                    },
                                },
                            ],
                            volumeMounts: [{ name: "podinfo", mountPath: "/etc/podinfo"}],
                        }
                    ]
                }
            },
        },
    },
    { provider: provider}
);

// Export the Deployment name
export let deploymentName = deployment.metadata.apply(m => m.name);

// Create a k8s-demo Ingress
const ing = new k8s.extensions.v1beta1.Ingress(config.name,
    {
        metadata: {
            labels: { app: config.name },
            namespace: namespaceName,
            annotations: {"kubernetes.io/ingress.class": config.nginxIngressClass},
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

// Export the Ingress Name and Address
export let ingressName = ing.metadata.apply(m => m.name)
export let ingressHostname = ing.status.apply(status => status.loadBalancer.ingress[0].hostname)

// curl Command
// Export the curl command to hit the ingress endpoint for the k8s-demo
export let fullCurlCommand = pulumi.concat("curl -v -H 'Host: ", config.hostname, "' http://", ingressHostname, "/foobar")
export let curlCommand = pulumi.concat("curl -v ", config.hostname, "/foobar")
export let url = pulumi.concat(config.hostname, "/foobar")
