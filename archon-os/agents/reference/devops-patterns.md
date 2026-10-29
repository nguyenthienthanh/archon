# DevOps Agent - Reference Patterns

**Source:** `agents/devops.md`
**Load:** On-demand when deep DevOps expertise needed

---

## Core Competencies

```toon
competencies[8]{area,technologies}:
  Containerization,"Docker (multi-stage builds, layer caching, Distroless/Alpine), Trivy scanning, registries (ECR/GCR/ACR)"
  Orchestration,"K8s (Deployments, Services, Ingress, ConfigMaps, Secrets), Helm, Kustomize, RBAC, Network Policies, Prometheus/Grafana"
  CI/CD,"GitHub Actions, GitLab CI, Azure Pipelines, Jenkins, CircleCI — stages: Build→Test→Scan→Deploy"
  IaC,"Terraform (AWS/GCP/Azure, modules, state mgmt), CloudFormation, Pulumi, Ansible"
  Cloud (AWS),"EC2/ECS/EKS/Lambda/Fargate, S3/EBS, RDS/DynamoDB/Aurora, VPC/ALB/Route53/CloudFront, IAM/Secrets Manager/KMS/WAF, CloudWatch/X-Ray"
  Cloud (GCP),"Compute Engine/GKE/Cloud Run/Functions, Cloud Storage, Cloud SQL/Firestore/BigQuery, VPC/LB/CDN, IAM/Secret Manager/Cloud Armor"
  Cloud (Azure),"VM/AKS/Container Instances/Functions, Blob Storage, Azure SQL/Cosmos DB, VNet/App Gateway, Azure AD/Key Vault"
  Monitoring,"Prometheus/Grafana/Datadog/New Relic, ELK/Loki, APM, PagerDuty/Opsgenie, Jaeger/Zipkin/X-Ray"
```

### Secrets Management

HashiCorp Vault (dynamic secrets), AWS Secrets Manager (auto-rotation), Azure Key Vault, GCP Secret Manager, env variables + CI/CD secrets.

### Deployment Strategies

Blue-Green (zero-downtime), Canary (gradual %), Rolling (sequential), A/B (feature flags), Rollback (quick revert).

---

## Best Practices

```toon
best_practices[4]{area,rules}:
  Dockerfile,"Multi-stage builds, specific version tags (not latest), non-root user, .dockerignore, minimize layers, health checks, vuln scanning"
  Kubernetes,"Resource requests/limits, liveness/readiness probes, Secrets (not ConfigMaps) for sensitive data, RBAC, network policies, namespaces, HPA"
  CI/CD,"Tests before deploy, security scanning in pipeline, automated rollback, caching, separate staging/prod, tag images with git SHA, secrets in CI platform"
  IaC,"Version control, modules for reuse, state locking, workspaces per env, plan before apply, document changes"
```

---

## Workflows

```toon
workflows[4]{command,steps,deliverables}:
  docker:create,"Analyze project → optimized Dockerfile → .dockerignore → health check → test","Dockerfile (multi-stage), .dockerignore, docker-compose.yml, build instructions"
  /run deploy cicd,"Detect platform → pipeline config → stages (lint/test/build/deploy) → security scan → secrets","Pipeline config, setup instructions, secret config guide"
  /run deploy docker,"Dockerfile → docker-compose → multi-stage → health checks → .dockerignore","Docker config, compose file, build guide"
  /run deploy setup,"Choose platform → IaC code → deploy scripts → env vars → monitoring","IaC code, deploy scripts, env config, monitoring setup"
```

---

## Deliverables by Phase

```toon
deliverables[3]{phase,outputs}:
  Phase 1 (Understand + Design),"Deployment architecture, infra requirements, cloud provider selection"
  Phase 4 (Refactor + Review),"Dockerfile, CI/CD pipeline, K8s manifests, IaC code"
  Phase 5 (Finalize),"Deployment guide, monitoring setup, rollback procedures, production checklist"
```
