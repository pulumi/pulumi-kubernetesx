import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import * as aws from "@pulumi/aws";
import * as fluentd from "./fluentd-cloudwatch";
import { config } from "./config";

export type FluentdCloudWatchOptions = {
    provider?: k8s.Provider;
    namespace?: pulumi.Input<string>;
    iamRoleArn?: pulumi.Input<string>;
};

export class FluentdCloudWatch extends pulumi.ComponentResource {
    public readonly helmChart: k8s.helm.v2.Chart;

    constructor(
        name: string,
        args: FluentdCloudWatchOptions = {},
        opts?: pulumi.ComponentResourceOptions,
    ){
        super(config.pulumiComponentNamespace, name, args, opts);

        if (args.provider == undefined ||
            args.namespace == undefined ||
            args.iamRoleArn == undefined
        ){
            return {} as FluentdCloudWatch;
        }

        // Helm chart
        this.helmChart = fluentd.makeFluentdCloudWatch(
            args.provider,
            args.namespace,
            args.iamRoleArn
        );
    }
}
