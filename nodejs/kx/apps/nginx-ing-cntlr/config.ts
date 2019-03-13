import * as pulumi from "@pulumi/pulumi";

export const config = {
    appImage: "quay.io/kubernetes-ingress-controller/nginx-ingress-controller:0.22.0",
    defaultBackendImage: "gcr.io/google_containers/defaultbackend:1.4",
};
