import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import { config } from "./config";

const appLabels = { app: config.appName };

// Create a Deployment
export function makeExternalDnsDeployment(
    provider: k8s.Provider,
    namespace: pulumi.Input<string>,
    serviceAccountName: pulumi.Input<string>,
    iamRoleArn: pulumi.Input<string>,
    primaryContainerArgs: pulumi.Input<any>): k8s.apps.v1.Deployment {
        return new k8s.apps.v1.Deployment(config.appName, {
            metadata: {
                labels: appLabels,
                namespace: namespace,
            },
            spec: {
                replicas: 1,
                selector: { matchLabels: appLabels},
                template: {
                    metadata: {
                        labels: appLabels,
                        annotations: {
                            "iam.amazonaws.com/role": iamRoleArn,
                        },
                    },
                    spec: {
                        serviceAccountName: serviceAccountName,
                        containers: [
                            {
                                name: config.appName,
                                image: config.appImage,
                                args: primaryContainerArgs,
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
