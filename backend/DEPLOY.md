# Deployment — AWS Lambda (Quarkus native)

Nutri's backend runs as a GraalVM-native Lambda function behind an **API Gateway HTTP API**, using `quarkus-amazon-lambda-http` so standard JAX-RS resources work unchanged.

## 1. Prereqs

- **Java 25** (Corretto, Temurin, or Oracle)
- **GraalVM 25** (`Mandrel 25` or `GraalVM CE 25`) with `native-image`
- **Docker** (alternative: `quarkus.native.container-build=true`)
- **AWS CLI** + credentials
- `ANTHROPIC_API_KEY`, `SUPABASE_DB_*` ready

## 2. Native build

Local toolchain:
```bash
./mvnw package -Pnative
```

Or container-based (no local GraalVM needed):
```bash
./mvnw package -Pnative \
  -Dquarkus.native.container-build=true \
  -Dquarkus.native.builder-image=quay.io/quarkus/ubi9-quarkus-mandrel-builder-image:jdk-25
```

Outputs:
- `target/function.zip` — the Lambda deployment package (bootstrap + native binary)
- `target/sam.jvm.yaml`, `target/sam.native.yaml` — SAM templates

## 3. Database

1. Create a Supabase project.
2. In the SQL editor, run `db/schema.sql`.
3. Grab the **connection pooler** URL (port `6543`) for Lambda — it handles the short-lived connections efficiently. Example:
   ```
   jdbc:postgresql://aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require
   ```

## 4. Deploy with SAM (easiest)

```bash
sam deploy -t target/sam.native.yaml --guided \
  --parameter-overrides \
    AnthropicApiKey=sk-ant-... \
    SupabaseUrl="jdbc:postgresql://...pooler.supabase.com:6543/postgres?sslmode=require" \
    SupabaseUser=postgres.xxxxx \
    SupabasePassword=xxxxx
```

The generated template creates:
- a Lambda function (`provided.al2023` runtime, native bootstrap)
- an **API Gateway HTTP API** that forwards every path to the function
- CloudWatch log group

If the template does not template the env vars yet, add this to the `Function` properties:

```yaml
Environment:
  Variables:
    ANTHROPIC_API_KEY: !Ref AnthropicApiKey
    SUPABASE_DB_URL: !Ref SupabaseUrl
    SUPABASE_DB_USER: !Ref SupabaseUser
    SUPABASE_DB_PASSWORD: !Ref SupabasePassword
    DISABLE_SIGNAL_HANDLERS: true
```

## 5. Manual deploy (AWS CLI)

```bash
aws lambda create-function \
  --function-name nutri-api \
  --runtime provided.al2023 \
  --role arn:aws:iam::<acct>:role/nutri-lambda-role \
  --handler not.used.for.native \
  --zip-file fileb://target/function.zip \
  --architectures x86_64 \
  --memory-size 512 \
  --timeout 15 \
  --environment "Variables={ANTHROPIC_API_KEY=...,SUPABASE_DB_URL=...,SUPABASE_DB_USER=...,SUPABASE_DB_PASSWORD=...}"

aws apigatewayv2 create-api \
  --name nutri-api --protocol-type HTTP \
  --target arn:aws:lambda:<region>:<acct>:function:nutri-api
```

Attach a `lambda:InvokeFunction` permission on the API Gateway principal.

## 6. Post-deploy

Point the frontend at the API Gateway URL by building with:
```bash
VITE_API_BASE=https://<api-id>.execute-api.<region>.amazonaws.com npm run build
```

(Or update `vite.config.js` `proxy` / swap the `BASE` constant in `src/lib/api.js` to use the env var.)

## Tips

- **Cold start**: native image starts in ~100–200 ms. Keep memory at 512 MB+ for better CPU.
- **Secrets**: move `ANTHROPIC_API_KEY` to **AWS Secrets Manager** once past MVP; read it in a `@Startup` observer.
- **Logs**: `aws logs tail /aws/lambda/nutri-api --follow`.
- **Schema migrations**: run `schema.sql` via Supabase SQL editor or a one-off Flyway/Liquibase pipeline.
