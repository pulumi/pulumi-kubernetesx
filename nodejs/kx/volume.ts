import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import * as input from "@pulumi/kubernetes/types/input";

// Attach a volume at the mountPath in the containers specified.
export function addVolumeMount (
    name: pulumi.Input<string>,
    mountPath: pulumi.Input<string>,
    containers: pulumi.Input<any>,
) {
    if (containers !== undefined) {
        containers.map((c: any) => {
            if (c.volumeMounts === undefined ) {
                c.volumeMounts = [];
            }
            c.volumeMounts.push({
                name: name,
                mountPath: mountPath,
            });
        });
    }
}

// Add a volume to the volumes.
export function addVolume(
    volume: input.core.v1.Volume,
    volumes: pulumi.Input<any>,
) {
    if (volumes === undefined ) {
        volumes = [];
    }
    volumes.push(volume);
}

// Adds environment variables from the ConfigMap into the containers.
export function addEnvVarsFromConfigMap(
    configMapName: pulumi.Input<string>,
    containers: pulumi.Input<any>,
) {
    if (containers !== undefined) {
        containers.map((c: any) => {
            if (c.envFrom === undefined ) {
                c.envFrom = [];
            }
            c.envFrom.push({configMapRef: {name: configMapName}});
        });
    }
}

// Adds environment variables from the Secret into the containers.
export function addEnvVarsFromSecret(
    secretName: pulumi.Input<string>,
    containers: pulumi.Input<any>,
) {
    if (containers !== undefined) {
        containers.map((c: any) => {
            if (c.envFrom === undefined ) {
                c.envFrom = [];
            }
            c.envFrom.push({secretRef: {name: secretName}});
        });
    }
}

// Add an environment variable into the *all* containers.
export function addEnvVar(
    environmentVar: input.core.v1.EnvVar,
    containers: pulumi.Input<any>,
) {
    if (containers !== undefined) {
        containers.map((c: any) => {
            if (c.env === undefined ) {
                c.env = [];
            }
            c.env.push(environmentVar);
        });
    }
}

// Adds environment variables from the Pod fieldRef Downward API into *all* containers.
export function addEnvVars(
    environmentVars: input.core.v1.EnvVar[],
    containers: pulumi.Input<any>,
) {
    if (containers !== undefined) {
        containers.map((c: any) => {
            if (c.env === undefined ) {
                c.env = [];
            }
            c.env.push(...environmentVars);
        });
    }
}

export const downwardApiEnvVars: input.core.v1.EnvVar[] = [
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
];

export const downwardApiVolume: input.core.v1.Volume = {
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
};

