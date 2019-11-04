import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import * as rbac from "./rbac";
import { config } from "./config";
// TODO: import from a persisent package location
import * as kx from "../../../kx";

export type NginxIngressControllerOptions = {
    namespace?: pulumi.Input<string>;
    provider?: k8s.Provider;
    nginxReplicas?: pulumi.Input<number>;
    ingressClass?: pulumi.Input<string>;
    svcPortType?: pulumi.Input<string>;
    svcPorts?: pulumi.Input<any>;
};

const pulumiComponentNamespace: string = "pulumi:kx:NginxIngressController";

// Assemble the resources.
const resources = {
    limits: {cpu: "256m", memory: "256Mi"},
    requests: { cpu: "256m", memory: "256Mi"},
};

// Assemble the defaultHttpBackend resources.
const defaultHttpBackendResources = {
    limits: {cpu: "10m", memory: "20Mi"},
    requests: { cpu: "10m", memory: "20Mi"},
};

export class NginxIngressController extends pulumi.ComponentResource {
    public readonly serviceAccount: k8s.core.v1.ServiceAccount;
    public readonly serviceAccountName: pulumi.Output<string>;
    public readonly clusterRole: k8s.rbac.v1.ClusterRole;
    public readonly clusterRoleName: pulumi.Output<string>;
    public readonly role: k8s.rbac.v1.Role;
    public readonly roleName: pulumi.Output<string>;
    public readonly clusterRoleBinding: k8s.rbac.v1.ClusterRoleBinding;
    public readonly roleBinding: k8s.rbac.v1.RoleBinding;
    public readonly defaultBackendService: k8s.core.v1.Service;
    public readonly defaultBackendServiceName: pulumi.Output<string>;
    public readonly defaultBackendDeployment: k8s.apps.v1.Deployment;
    public readonly defaultBackendDeploymentName: pulumi.Output<string>;
    public readonly service: k8s.core.v1.Service;
    public readonly serviceName: pulumi.Output<string>;
    public readonly deployment: k8s.apps.v1.Deployment;

    constructor(
        name: string,
        args: NginxIngressControllerOptions = {},
        opts?: pulumi.ComponentResourceOptions,
    ) {
        super(pulumiComponentNamespace, name, args, opts);

        if (args.namespace === undefined ||
            args.provider === undefined ||
            args.nginxReplicas === undefined ||
            args.ingressClass === undefined ||
            args.svcPortType === undefined ||
            args.svcPorts === undefined
        ) {
            return {} as NginxIngressController;
        }

        const appName = kx.utils.trimString(`${name}`.toLowerCase(), 40);
        const defaultHttpBackendName = "nginx-default-http-backend";
        const defaultBackendAppLabels = { app: defaultHttpBackendName};
        const nginxAppLabels = { app: appName };

        // ServiceAccount
        this.serviceAccount = rbac.makeNginxServiceAccount(
            name, args.provider, args.namespace);
        this.serviceAccountName = this.serviceAccount.metadata.apply(m => m.name);

        // RBAC ClusterRole & Role
        this.clusterRole = rbac.makeNginxClusterRole(
            name, args.provider);
        this.clusterRoleName = this.clusterRole.metadata.apply(m => m.name);
        this.clusterRoleBinding = rbac.makeNginxClusterRoleBinding(
            name, args.provider, args.namespace,
            this.serviceAccountName, this.clusterRoleName);

        this.role = rbac.makeNginxRole(
            name, args.provider, args.namespace, args.ingressClass);
        this.roleName = this.role.metadata.apply(m => m.name);
        this.roleBinding = rbac.makeNginxRoleBinding(
            name, args.provider, args.namespace,
            this.serviceAccountName, this.roleName);

        // Backend Deployment and Service
        this.defaultBackendService = makeNginxDefaultBackendService(
            defaultHttpBackendName, args.provider, defaultBackendAppLabels, args.namespace);
        this.defaultBackendServiceName = this.defaultBackendService.metadata.apply(m => m.name);
        this.defaultBackendDeployment = makeNginxDefaultBackendDeployment(
            defaultHttpBackendName, args.provider,
            defaultBackendAppLabels, args.namespace);
        this.defaultBackendDeploymentName = this.defaultBackendDeployment.metadata.apply(m => m.name);

        // Deployment and Service
        this.service = makeNginxService(
            appName, args.provider, nginxAppLabels, args.namespace,
            args.svcPortType, args.svcPorts);
        this.serviceName = this.service.metadata.apply(m => m.name);
        this.deployment = makeNginxDeployment(
            appName, args.provider, nginxAppLabels, args.nginxReplicas,
            args.namespace, args.ingressClass,
            this.serviceAccountName, this.defaultBackendServiceName, this.serviceName);
    }
}

// Create a default-http-backend Service.
export function makeNginxDefaultBackendService(
    name: string,
    provider: k8s.Provider,
    labels: pulumi.Input<any>,
    namespace: pulumi.Input<string>): k8s.core.v1.Service {
    return new k8s.core.v1.Service(
        name,
        {
            metadata: {
                labels: labels,
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
                selector: labels,
            },
        },
        {
            provider: provider,
        },
    );
}

// Create a default-http-backend Deployment.
export function makeNginxDefaultBackendDeployment(
    name: string,
    provider: k8s.Provider,
    labels: pulumi.Input<any>,
    namespace: pulumi.Input<string>): k8s.apps.v1.Deployment {
    // Define the Pod args.
    const podBuilder = new kx.PodBuilder(name, provider, {
        podSpec: {
            containers: [{
                name: name,
                // Any image is permissable as long as:
                // 1. It serves a 404 page at /
                // 2. It serves 200 on a /healthz endpoint
                image: config.defaultBackendImage,
                resources: defaultHttpBackendResources,
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
            }],
        },
    })
        .withMetadata({
            labels: labels,
            namespace: namespace,
        });

    // Create the Deployment.
    return podBuilder.createDeployment(name, { replicas: 1 });
}

// Create a Service.
export function makeNginxService(
    name: string,
    provider: k8s.Provider,
    labels: pulumi.Input<any>,
    namespace: pulumi.Input<string>,
    svcType: pulumi.Input<string>,
    svcPorts: pulumi.Input<any>): k8s.core.v1.Service {
    return new k8s.core.v1.Service(
        name,
        {
            metadata: {
                labels: labels,
                namespace: namespace,
                annotations: {
                    "pulumi.com/skipAwait": "true",
                },
            },
            spec: {
                type: svcType,
                ports: svcPorts,
                selector: labels,
            },
        },
        {
            provider: provider,
        },
    );
}

// Create a Deployment.
export function makeNginxDeployment(
    name: string,
    provider: k8s.Provider,
    labels: pulumi.Input<any>,
    nginxReplicas: pulumi.Input<number>,
    namespace: pulumi.Input<string>,
    ingressClass: pulumi.Input<string>,
    serviceAccountName: pulumi.Input<string>,
    defaultBackendServiceName: pulumi.Input<string>,
    serviceName: pulumi.Input<string>): k8s.apps.v1.Deployment {
    // Define the Pod args.
    const podBuilder = new kx.PodBuilder(name, provider, {
        podSpec: {
            serviceAccountName: serviceAccountName,
            terminationGracePeriodSeconds: 60,
            containers: [
                {
                    name: name,
                    image: config.appImage,
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
                            defaultBackendServiceName,
                        ),
                        "--ingress-class=" + ingressClass,
                        pulumi.concat(
                            "--publish-service=$(POD_NAMESPACE)/",
                            serviceName,
                        ),
                    ]),
                },
            ],
        },
    })
        .withMetadata({
            labels: labels,
            annotations: {
                "prometheus.io/port": "10254",
                "prometheus.io/scrape": "true",
            },
            namespace: namespace,
        });

    // Create the Deployment.
    return podBuilder.createDeployment(name, { replicas: 2 });
}
