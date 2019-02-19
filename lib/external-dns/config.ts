import * as pulumi from "@pulumi/pulumi";

export const config = {
    appName: "external-dns",
    appImage: "registry.opensource.zalan.do/teapot/external-dns:v0.5.11",
    pulumiComponentNamespace: "kcloud:lib:ExternalDns",
};
