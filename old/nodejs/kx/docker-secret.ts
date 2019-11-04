import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import * as input from "@pulumi/kubernetes/types/input";
import * as utils from "./utils";

// DockerSecretBuilderArgs implements the spec settings for a
// dockerconfigjson typed Kubernetes Secret.
export type DockerSecretBuilderArgs = {
    namespace?: pulumi.Input<string>;
    labels?: pulumi.Input<any>;
    dockerConfigJson?: pulumi.Input<string>;
};

// Pulumi namespace for the new DockerSecretBuilder pulumi.ComponentResource
const pulumiComponentNamespace: string = "pulumi:kx:DockerSecretBuilder";

// DockerSecretBuilder implements a dockerconfigjson Kubernetes Secret, with the
// specified DockerSecretBuilderArgs.
export class DockerSecretBuilder extends pulumi.ComponentResource {
    public readonly dockerSecretBuilderName: string;
    public readonly dockerSecretBuilderProvider: k8s.Provider;
    public readonly dockerSecretBuilder: input.core.v1.Secret;

    constructor(
        name: string,
        provider: k8s.Provider,
        args: DockerSecretBuilderArgs,
        opts?: pulumi.ComponentResourceOptions,
    ) {
        super(pulumiComponentNamespace, name, args, opts);

        if (args.dockerConfigJson === undefined ||
            provider === undefined) {
            return {} as DockerSecretBuilder;
        }

        this.dockerSecretBuilderName = name;
        this.dockerSecretBuilderProvider = provider;

        // Create dockerSecretBuilder base.
        this.dockerSecretBuilder = makeDockerSecretBuilderBase(
            name,
            args.dockerConfigJson,
            args.namespace,
            args.labels,
        );
    }

    // Create a new Secret from the DockerSecretBuilder.
    public toSecret = function(): k8s.core.v1.Secret {
        return new k8s.core.v1.Secret(
            this.dockerSecretBuilderName,
            this.dockerSecretBuilder,
            {
                provider: this.dockerSecretBuilderProvider,
            },
        );
    };
}

// Create a base for a generic dockerconfigjson Kubernetes Secret.
export function makeDockerSecretBuilderBase(
    name: string,
    dockerConfigJson: pulumi.Input<string>,
    namespace?: pulumi.Input<string>,
    labels?: pulumi.Input<any>,
): input.core.v1.Secret {
    return {
        type: "kubernetes.io/dockerconfigjson",
        metadata: {
            labels: utils.objOrDefault(labels, []),
            namespace: utils.objOrDefault(namespace, "default"),
        },
        data: {
            ".dockerconfigjson": dockerConfigJson,
        },
    };
}
