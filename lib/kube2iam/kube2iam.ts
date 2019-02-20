import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import { config } from "./config";

const appLabels = { app: config.appName };

// Create a Deployment
export function makeKube2IamDaemonSet(
    provider: k8s.Provider,
    namespace: pulumi.Input<string>,
    serviceAccountName: pulumi.Input<string>,
    primaryContainerArgs: pulumi.Input<any>,
    ports: pulumi.Input<any>): k8s.apps.v1.DaemonSet {
        return new k8s.apps.v1.DaemonSet(config.appName, {
            metadata: {
                labels: appLabels,
                namespace: namespace,
            },
            spec: {
                selector: { matchLabels: appLabels},
                template: {
                    metadata: {
                        labels: appLabels,
                    },
                    spec: {
                        serviceAccountName: serviceAccountName,
                        hostNetwork: true,
                        containers: [
                            {
                                name: config.appName,
                                image: config.appImage,
                                args: primaryContainerArgs,
                                ports: ports,
                                securityContext: {
                                    privileged: true
                                },
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
                                    {
                                        name: "HOST_IP",
                                        valueFrom: {
                                            fieldRef: {
                                                fieldPath: "status.podIP",
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
