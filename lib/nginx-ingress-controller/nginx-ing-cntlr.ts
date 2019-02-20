import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import { config } from "./config";

const defaultBackendAppLabels = { app: config.defaultBackendAppName };
const nginxAppLabels = { app: config.appName };

// Create a default-http-backend Service for NGINX
export function makeNginxDefaultBackendService(
    provider: k8s.Provider,
    namespace: pulumi.Input<string>): k8s.core.v1.Service {
        return new k8s.core.v1.Service(config.defaultBackendAppName,
            {
                metadata: {
                    labels: defaultBackendAppLabels,
                    namespace: namespace,
                },
                spec: {
                    type: "ClusterIP",
                    ports: [
                        {
                            port: 80,
                            protocol: "TCP",
                            targetPort: "http",
                        },
                    ],
                    selector: defaultBackendAppLabels,
                },
            },
            {
                provider: provider,
            }
        )
    }

// Create a default-http-backend Deployment for NGINX
export function makeNginxDefaultBackendDeployment(
    provider: k8s.Provider,
    namespace: pulumi.Input<string>): k8s.apps.v1.Deployment {
        return new k8s.apps.v1.Deployment(config.defaultBackendAppName,
            {
                metadata: {
                    labels: defaultBackendAppLabels,
                    namespace: namespace,
                },
                spec: {
                    replicas: 1,
                    selector: { matchLabels: defaultBackendAppLabels},
                    template: {
                        metadata: {
                            labels: defaultBackendAppLabels,
                        },
                        spec: {
                            terminationGracePeriodSeconds: 60,
                            containers: [
                                {
                                    name: config.defaultBackendAppName,
                                    /*
                            Any image is permissable as long as:
                              1. It serves a 404 page at /
                              2. It serves 200 on a /healthz endpoint
                                     */
                                    image: config.defaultBackendImage,
                                    imagePullPolicy: "Always",
                                    ports: [{ name: "http", containerPort: 8080 }],
                                    readinessProbe: {
                                        httpGet: {
                                            path: "/healthz",
                                            port: 8080,
                                            scheme: "HTTP",
                                        },
                                    },
                                    livenessProbe: {
                                        httpGet: {
                                            path: "/healthz",
                                            port: 8080,
                                            scheme: "HTTP",
                                        },
                                        initialDelaySeconds: 30,
                                        timeoutSeconds: 5,
                                    },
                                    resources: {
                                        limits: {
                                            cpu: "10m",
                                            memory: "20Mi",
                                        },
                                        requests: {
                                            cpu: "10m",
                                            memory: "20Mi",
                                        },
                                    }
                                }
                            ]
                        }
                    }
                }
            },
            {
                provider: provider,
            }
        )
    }

// Create a Service for NGINX
export function makeNginxService(
    provider: k8s.Provider,
    namespace: pulumi.Input<string>,
    svcType: pulumi.Input<string>,
    svcPorts: pulumi.Input<any>): k8s.core.v1.Service {
        return new k8s.core.v1.Service(config.appName,
            {
                metadata: {
                    labels: nginxAppLabels,
                    namespace: namespace,
                    annotations: {
                        "pulumi.com/skipAwait": "true",
                    }
                },
                spec: {
                    type: svcType,
                    ports: svcPorts,
                    selector: nginxAppLabels,
                },
            },
            {
                provider: provider,
            }
        )
    }

// Create a Deployment for NGINX
export function makeNginxDeployment(
    provider: k8s.Provider,
    namespace: pulumi.Input<string>,
    ingressClass: pulumi.Input<string>,
    serviceAccountName: pulumi.Input<string>,
    defaultBackendServiceName: pulumi.Input<string>,
    serviceName: pulumi.Input<string>): k8s.apps.v1.Deployment {
        return new k8s.apps.v1.Deployment(config.appName,
            {
                metadata: {
                    labels: nginxAppLabels,
                    namespace: namespace,
                },
                spec: {
                    replicas: 1,
                    selector: { matchLabels: nginxAppLabels},
                    template: {
                        metadata: {
                            labels: nginxAppLabels,
                            annotations: {
                                "prometheus.io/port": "10254",
                                "prometheus.io/scrape": "true",
                            },
                        },
                        spec: {
                            serviceAccountName: serviceAccountName,
                            terminationGracePeriodSeconds: 60,
                            containers: [
                                {
                                    name: config.appName,
                                    image: config.appImage,
                                    imagePullPolicy: "Always",
                                    ports: [{ name: "http", containerPort: 80 }],
                                    readinessProbe: {
                                        httpGet: {
                                            path: "/healthz",
                                            port: 10254,
                                            scheme: "HTTP",
                                        },
                                    },
                                    livenessProbe: {
                                        httpGet: {
                                            path: "/healthz",
                                            port: 10254,
                                            scheme: "HTTP",
                                        },
                                        initialDelaySeconds: 10,
                                        timeoutSeconds: 1,
                                    },
                                    // For more info on all CLI args available:
                                    // https://github.com/kubernetes/ingress-nginx/blob/master/docs/user-guide/cli-arguments.md
                                    args: pulumi.all([
                                        "/nginx-ingress-controller",
                                        pulumi.concat(
                                            "--default-backend-service=$(POD_NAMESPACE)/",
                                            defaultBackendServiceName
                                        ),
                                        "--ingress-class=" + ingressClass,
                                        pulumi.concat(
                                            "--publish-service=$(POD_NAMESPACE)/",
                                            serviceName
                                        ),
                                    ]),
                                    // Use k8s Downward API
                                    env: [
                                        {
                                            name: "POD_NAME",
                                            valueFrom: {
                                                fieldRef: {
                                                    fieldPath: "metadata.name",
                                                },
                                            },
                                        },
                                        {
                                            name: "POD_NAMESPACE",
                                            valueFrom: {
                                                fieldRef: {
                                                    fieldPath: "metadata.namespace",
                                                },
                                            },
                                        },
                                    ],
                                }
                            ]
                        }
                    }
                }
            },
            {
                provider: provider,
            }
        )
    }
