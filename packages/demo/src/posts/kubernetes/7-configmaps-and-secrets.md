# [쿠버네티스 실무 7/14] ConfigMap과 Secret: 설정과 비밀을 이미지 밖으로

> **한 줄 요약** — 같은 이미지를 환경마다 다른 설정으로 돌리기 위해 설정은 ConfigMap에, 비밀번호와 키는 Secret에 두고 파드에 환경 변수나 파일로 넣는데, 파일로 넣은 값은 바꾸면 잠시 뒤 파드 안에도 반영되지만 환경 변수는 파드를 다시 만들어야 바뀌고, Secret은 기본으로 base64일 뿐 암호화가 아니므로 접근 권한과 저장 암호화를 따로 챙겨야 한다.

## 이 글에서 다루는 것
- 설정을 이미지 밖에 두는 이유
- ConfigMap 만들기와 넣는 두 방법: 환경 변수, 파일
- 직접 해 보기: 값을 바꿨을 때 무엇이 따라 바뀌나
- Secret: base64와 암호화의 차이, 지키는 방법
- 바뀌지 않는 설정과 롤아웃

## 설정을 이미지 밖에
이미지에 데이터베이스 주소를 넣어 빌드하면, 개발·스테이징·운영마다 이미지를 따로 만들어야 한다. 그러면 테스트한 이미지와 운영에 올라가는 이미지가 달라진다. 그래서 이미지는 하나로 두고, 환경마다 다른 값은 **실행할 때** 넣는다(도커와 컨테이너 10편). 쿠버네티스에서는 그 값을 두 종류의 오브젝트에 둔다.
- **ConfigMap**: 일반 설정. 로그 수준, 기능 스위치, 설정 파일 전체.
- **Secret**: 비밀 값. 비밀번호, API 키, TLS 인증서(6편).

## ConfigMap 만들고 넣기
값 하나하나(`--from-literal`)나 파일 통째로(`--from-file`) 만들 수 있다.
```bash
cat > app.properties <<'EOF'
greeting=hello
cache.ttl=60
EOF
kubectl create configmap app-config --from-literal=LOG_LEVEL=info --from-file=app.properties
kubectl get configmap app-config -o jsonpath='{.data.LOG_LEVEL}{"\n"}{.data.app\.properties}'
```
```text
configmap/app-config created
info
greeting=hello
cache.ttl=60
```
파드에 넣는 방법은 둘이다. 같은 ConfigMap을 **환경 변수**(`envFrom`)로도, **파일**(볼륨)로도 넣어 본다.
```yaml
# 파일: app.yaml
apiVersion: v1
kind: Pod
metadata:
  name: app
spec:
  containers:
    - name: app
      image: busybox:1.36
      command: ["sleep", "3600"]
      envFrom:
        - configMapRef:
            name: app-config          # 키마다 환경 변수 하나
      env:
        - name: DB_PASSWORD
          valueFrom:
            secretKeyRef:
              name: db-secret
              key: password
      volumeMounts:
        - name: config
          mountPath: /etc/app         # 키마다 파일 하나
          readOnly: true
  volumes:
    - name: config
      configMap:
        name: app-config
```
환경 변수 `DB_PASSWORD`는 Secret에서 온다. Secret을 먼저 만든다.
```bash
kubectl create secret generic db-secret --from-literal=password='s3cr3t-pw' > /dev/null
kubectl apply -f app.yaml > /dev/null && kubectl wait --for=condition=Ready pod/app --timeout=60s > /dev/null
kubectl exec app -- sh -c 'echo "환경 변수 LOG_LEVEL=$LOG_LEVEL"; echo "파일: $(ls /etc/app | tr "\n" " ")"; cat /etc/app/LOG_LEVEL; echo'
kubectl exec app -- sh -c 'echo "비밀번호 길이: ${#DB_PASSWORD}"'
```
```text
환경 변수 LOG_LEVEL=info
파일: LOG_LEVEL app.properties 
info
비밀번호 길이: 9
```
- `envFrom`은 키마다 환경 변수를 만들었다. `app.properties`처럼 이름에 점이 있는 키는 환경 변수 이름이 될 수 없어 건너뛴다.
- 볼륨은 키마다 파일을 만들었다. 설정 파일 전체를 넣을 때는 이쪽이 자연스럽다.

## 값을 바꾸면
`LOG_LEVEL`을 `debug`로 바꾼다. 파드 안에서는 무엇이 바뀔까.
```bash
kubectl create configmap app-config --from-literal=LOG_LEVEL=debug --from-file=app.properties \
  --dry-run=client -o yaml | kubectl replace -f - > /dev/null      # 같은 이름으로 내용을 바꾼다
start=$(date +%s)
until [ "$(kubectl exec app -- cat /etc/app/LOG_LEVEL)" = debug ]; do sleep 2; done
echo "파일이 바뀌었다 ($(( $(date +%s) - start < 120 )) = 2분 안에)"
kubectl exec app -- sh -c 'echo "환경 변수는 그대로: $LOG_LEVEL"'
```
```text
파일이 바뀌었다 (1 = 2분 안에)
환경 변수는 그대로: info
```
- **파일**은 kubelet이 주기적으로 맞춰 주므로 잠시 뒤(보통 1분 안팎) 바뀌었다. 앱이 파일을 다시 읽거나 변화를 감지하면 재시작 없이 새 설정을 쓸 수 있다.
- **환경 변수**는 프로세스가 시작할 때 정해지므로 그대로다. 새 값을 쓰려면 파드를 다시 만들어야 한다. 디플로이먼트라면 `kubectl rollout restart deployment/이름`으로 롤링 재시작한다.

어느 쪽이든 "설정이 언제 바뀌었는지"가 흐려진다. 그래서 실무에서는 설정이 바뀔 때 **이름이 바뀌는** ConfigMap(`app-config-5f2c9`처럼 내용의 해시를 붙인다, 14편의 Kustomize가 자동으로 해 준다)을 만들고, 디플로이먼트가 새 이름을 가리키게 해 롤링 업데이트로 반영하는 방법을 많이 쓴다. 되돌리기도 디플로이먼트처럼 할 수 있다. 바뀌면 안 되는 설정은 `immutable: true`로 고정하면 실수도 막고 kubelet이 감시할 부담도 준다.

## Secret은 암호화가 아니다
Secret의 값은 YAML에서 base64로 적힌다. base64는 바이너리를 글자로 옮기는 **인코딩**일 뿐이라, 읽을 권한만 있으면 누구나 되돌린다.
```bash
kubectl get secret db-secret -o jsonpath='{.data.password}'; echo
kubectl get secret db-secret -o jsonpath='{.data.password}' | base64 -d; echo
kubectl exec app -- mount | grep -c 'tmpfs on /var/run/secrets'
kubectl delete pod app --now > /dev/null; kubectl delete configmap app-config > /dev/null; kubectl delete secret db-secret > /dev/null
```
```text
czNjcjN0LXB3
s3cr3t-pw
1
```
그래도 Secret을 따로 두는 데는 이유가 있다.
- **권한을 나눌 수 있다**: RBAC(13편)으로 ConfigMap은 읽게 하고 Secret은 막을 수 있다.
- **노드에서 디스크에 쓰지 않는다**: 파일로 넣은 Secret은 메모리 파일 시스템(tmpfs)에 놓인다. 위에서 본 서비스 계정 토큰(`/var/run/secrets/...`)도 그렇게 들어간 Secret이다.
- **저장 암호화를 켤 수 있다**: API 서버 설정(EncryptionConfiguration)으로 etcd에 저장될 때 암호화한다. 관리형 쿠버네티스는 클라우드의 키 관리 서비스와 연동해 준다.

더 나아가 비밀 값의 원본을 클라우드 비밀 저장소(AWS Secrets Manager, Vault 등)에 두고 External Secrets Operator 같은 도구가 Secret으로 옮겨 오게 하거나, Git에 넣을 수 있게 암호화한 형태로 두는 Sealed Secrets를 쓴다. 평문 Secret YAML을 Git에 넣는 것은 비밀번호를 커밋하는 것과 같다.

## 흔한 오해
- "ConfigMap을 바꾸면 앱이 알아서 새 설정을 쓴다": 환경 변수는 재시작해야 바뀌고, 파일은 바뀌어도 앱이 다시 읽어야 한다. `subPath`로 파일 하나만 마운트하면 파일도 바뀌지 않는다.
- "Secret은 암호화되어 있다": base64 인코딩이다. 저장 암호화는 따로 켜야 하고, 읽기 권한을 좁히는 것이 먼저다.
- "큰 설정 파일도 ConfigMap에 넣으면 된다": 오브젝트 하나는 1MiB를 넘을 수 없다. 큰 데이터는 볼륨(8편)이나 이미지에 둔다.

## 어디에 쓰이나
- 도커와 컨테이너 10편 「설정과 비밀: 환경 변수, 빌드 인자, 시크릿을 다루는 법」: 이미지 밖에서 값을 넣는 같은 원칙을 도커에서 본다.
- Terraform 인프라 코드 3편 「상태 파일: Terraform이 기억하는 세상」: "화면에서 가린 것과 저장소에서 지킨 것은 다르다"는 같은 교훈이다.
- GitHub 협업과 자동화 8편 「GitHub Actions 3: 비밀, 권한, OIDC, 서드파티 액션의 위험」: CI에서 클러스터로 비밀 값을 넘기는 경로를 함께 지킨다.

## 정리
- 이미지는 하나로 두고 환경마다 다른 값은 ConfigMap(설정)과 Secret(비밀)으로 넣는다.
- 환경 변수로 넣으면 재시작해야 바뀌고, 파일로 넣으면 잠시 뒤 바뀐다. 이름에 해시를 붙여 롤링 업데이트로 반영하는 방법이 가장 분명하다.
- Secret은 base64 인코딩일 뿐이다. RBAC, 저장 암호화, 외부 비밀 저장소로 지킨다.

## 더 알아보기
- 이전 글: 6편 「인그레스와 게이트웨이 API: 클러스터 밖에서 들어오는 HTTP」
- 다음 글: 8편 「볼륨과 StatefulSet: 파드가 사라져도 남는 데이터」
