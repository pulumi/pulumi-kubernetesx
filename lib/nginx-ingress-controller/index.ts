import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import * as nginxIngCntlrRBAC from "./nginx-ing-cntlr-rbac";
import * as nginxIngCntlr from "./nginx-ing-cntlr";
import { config } from "./config";

export type NginxIngressControllerOptions = {
    provider?: k8s.Provider;
    namespace?: pulumi.Input<string>;
    ingressClass?: pulumi.Input<string>;
    svcPortType?: pulumi.Input<string>;
    svcPorts?: pulumi.Input<any>;
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
    public readonly service: k8s.core.v1.Service;
    public readonly serviceName: pulumi.Output<string>;
    public readonly deployment: k8s.apps.v1.Deployment;

    constructor(
        name: string,
        args: NginxIngressControllerOptions = {},
        opts?: pulumi.ComponentResourceOptions,
    ){
        super(config.pulumiComponentNamespace, name, args, opts);

        if (args.provider == undefined ||
            args.namespace == undefined ||
            args.ingressClass == undefined ||
            args.svcPortType == undefined ||
            args.svcPorts == undefined
        ){
            return {} as NginxIngressController;
        }

        // NGINX ServiceAccount
        this.serviceAccount = nginxIngCntlrRBAC.makeNginxServiceAccount(args.provider, args.namespace)
        this.serviceAccountName = this.serviceAccount.metadata.apply(m => m.name);

        // NGINX RBAC Role & ClusterRole
        this.clusterRole = nginxIngCntlrRBAC.makeNginxClusterRole(args.provider);
        this.clusterRoleName = this.clusterRole.metadata.apply(m => m.name);
        this.clusterRoleBinding = nginxIngCntlrRBAC.makeNginxClusterRoleBinding(args.provider, args.namespace, this.serviceAccountName, this.clusterRoleName);

        this.role = nginxIngCntlrRBAC.makeNginxRole(args.provider, args.namespace, args.ingressClass);
        this.roleName = this.role.metadata.apply(m => m.name);
        this.roleBinding = nginxIngCntlrRBAC.makeNginxRoleBinding(args.provider, args.namespace, this.serviceAccountName, this.roleName);

        // NGINX Backend Deployment and Service
        this.defaultBackendService = nginxIngCntlr.makeNginxDefaultBackendService(args.provider, args.namespace);
        this.defaultBackendServiceName = this.defaultBackendService.metadata.apply(m => m.name);
        this.defaultBackendDeployment = nginxIngCntlr.makeNginxDefaultBackendDeployment(args.provider, args.namespace);

        // NGINX Deployment and Service
        this.service = nginxIngCntlr.makeNginxService(args.provider, args.namespace, args.svcPortType, args.svcPorts);
        this.serviceName = this.service.metadata.apply(m => m.name);
        this.deployment = nginxIngCntlr.makeNginxDeployment(args.provider, args.namespace, args.ingressClass, this.serviceAccountName, this.defaultBackendServiceName, this.serviceName);
    }
}
