import * as pulumi from "@pulumi/pulumi";

export const config = {
    appName: "nginx-ing-cntlr",
    appImage: "quay.io/kubernetes-ingress-controller/nginx-ingress-controller:0.22.0",
    defaultBackendAppName: "default-http-backend",
    defaultBackendImage: "gcr.io/google_containers/defaultbackend:1.4",
    pulumiComponentNamespace: "kcloud:lib:NginxIngressController",
};
