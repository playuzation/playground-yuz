# [쿠버네티스 실무 12/14] 잡, 크론잡, 데몬셋: 디플로이먼트가 아닌 일들

> **한 줄 요약** — 끝나야 하는 일은 잡(Job)이 성공 횟수를 채울 때까지 파드를 띄우고 실패하면 정해진 횟수만큼 다시 시도하며, 정해진 시각마다 할 일은 크론잡(CronJob)이 잡을 만들어 맡기고, 노드마다 하나씩 돌아야 하는 로그 수집기나 모니터링 에이전트는 데몬셋(DaemonSet)이 노드가 늘고 줄 때 따라 붙인다.

## 이 글에서 다루는 것
- 계속 도는 일과 끝나는 일
- 잡: 완료 횟수, 병렬 수, 재시도, 인덱스
- 크론잡: 일정, 겹침 정책, 기록 보관
- 데몬셋: 노드마다 하나씩
- 직접 해 보기: 병렬 잡, 실패하는 잡, 크론잡 손으로 돌리기, 데몬셋

## 계속 도는 일과 끝나는 일
디플로이먼트(4편)는 웹 서버처럼 **계속 도는** 일을 위한 것이다. 컨테이너가 끝나면 다시 띄운다. 그런데 데이터베이스 마이그레이션, 리포트 만들기, 이미지 변환 묶음처럼 **끝나야 하는** 일도 있다. 이런 일을 디플로이먼트로 돌리면 끝난 컨테이너를 계속 다시 띄운다. 끝나는 일은 **잡**에 맡긴다.

## 잡
잡은 "이 파드가 성공적으로 끝나는 것을 N번 보겠다"를 지킨다.
- `completions`: 성공해야 하는 횟수(기본 1).
- `parallelism`: 동시에 띄울 파드 수.
- `backoffLimit`: 실패를 몇 번까지 다시 시도할지(기본 6). 다시 시도할 때마다 간격이 늘어난다.
- `activeDeadlineSeconds`: 전체에 걸 수 있는 시간 제한.
- `ttlSecondsAfterFinished`: 끝난 뒤 이 시간이 지나면 잡과 파드를 지운다.

잡의 파드는 `restartPolicy`가 `Never`나 `OnFailure`여야 한다(3편).

## 직접 해 보기: 병렬 잡
5개의 조각을 2개씩 동시에 처리한다. `completionMode: Indexed`를 주면 파드마다 0~4의 번호(`JOB_COMPLETION_INDEX`)가 붙어, 각자 맡을 조각을 안다.
```yaml
# 파일: shards.yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: shards
spec:
  completions: 5
  parallelism: 2
  completionMode: Indexed
  template:
    spec:
      restartPolicy: Never
      containers:
        - name: work
          image: busybox:1.36
          command: ["sh", "-c", "sleep 2; echo \"조각 $JOB_COMPLETION_INDEX 처리 완료\""]
```
```bash
kubectl apply -f shards.yaml > /dev/null
kubectl wait --for=condition=Complete job/shards --timeout=120s
kubectl get job shards -o jsonpath='성공 {.status.succeeded}/{.spec.completions}, 실패 {.status.failed}{"\n"}'
for p in $(kubectl get pods -l job-name=shards -o name); do kubectl logs $p; done | sort
```
```text
job.batch/shards condition met
성공 5/5, 실패 
조각 0 처리 완료
조각 1 처리 완료
조각 2 처리 완료
조각 3 처리 완료
조각 4 처리 완료
```
2개씩 동시에 돌며 다섯 조각을 모두 처리했다. 실패가 없어 `failed`는 비어 있다. 큐에서 일을 꺼내 처리하는 방식이라면 번호 대신 작업 큐(웹 앱의 원리 14편)를 쓰고, `completions` 없이 `parallelism`만 준다.

## 실패하는 잡
늘 실패하는 잡에 `backoffLimit: 2`를 준다.
```bash
kubectl create job broken --image=busybox:1.36 --dry-run=client -o yaml -- sh -c 'echo "입력 파일이 없다"; exit 1' \
  | sed 's/^spec:/spec:\n  backoffLimit: 2/' | kubectl apply -f - > /dev/null
kubectl wait --for=condition=Failed job/broken --timeout=180s > /dev/null
kubectl get job broken -o jsonpath='실패한 파드 {.status.failed}개, 이유: {.status.conditions[?(@.type=="Failed")].reason}{"\n"}'
kubectl delete job shards broken > /dev/null
```
```text
실패한 파드 3개, 이유: BackoffLimitExceeded
```
처음 한 번과 다시 시도 두 번, 모두 세 번 실패하자 잡을 실패로 끝냈다. 실패한 파드는 남아 있어 `kubectl logs`로 원인을 볼 수 있다. 다시 시도해도 결과가 같은 일(설정 오류)과 다시 하면 될 수도 있는 일(네트워크 오류)을 구별하고 싶으면 `podFailurePolicy`로 종료 코드에 따라 바로 실패시키거나 무시할 수 있다. 다시 시도되는 일이니 잡의 처리도 멱등해야 한다.

## 크론잡
크론잡은 크론 형식의 일정(`분 시 일 월 요일`)에 맞춰 잡을 만든다.
```yaml
# 파일: report.yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: report
spec:
  schedule: "17 3 * * *"          # 매일 3시 17분
  timeZone: "Asia/Seoul"
  concurrencyPolicy: Forbid        # 앞의 실행이 안 끝났으면 건너뛴다
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 1
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: Never
          containers:
            - name: report
              image: busybox:1.36
              command: ["sh", "-c", "echo 일일 리포트 생성"]
```
- `timeZone`이 없으면 컨트롤러가 도는 곳의 시간대(보통 UTC)를 따른다.
- `concurrencyPolicy`는 앞의 실행이 아직 끝나지 않았을 때 `Allow`(겹쳐 실행), `Forbid`(건너뜀), `Replace`(앞의 것을 멈추고 새로 실행) 중 하나다.
- 컨트롤러가 멈춰 있던 동안 놓친 실행은 `startingDeadlineSeconds` 안이면 늦게라도 한 번 실행한다.

다음 날 새벽을 기다릴 수는 없으니, 크론잡에서 잡을 손으로 만들어 바로 돌려 본다. 배포 직후 동작을 확인할 때 쓰는 방법이다.
```bash
kubectl apply -f report.yaml > /dev/null
kubectl create job --from=cronjob/report report-now > /dev/null
kubectl wait --for=condition=Complete job/report-now --timeout=60s > /dev/null
kubectl logs job/report-now
kubectl get cronjob report -o custom-columns=NAME:.metadata.name,SCHEDULE:.spec.schedule,TZ:.spec.timeZone,SUSPEND:.spec.suspend
kubectl delete -f report.yaml > /dev/null          # 크론잡에서 만든 잡도 함께 지워진다
```
```text
일일 리포트 생성
NAME     SCHEDULE     TZ           SUSPEND
report   17 3 * * *   Asia/Seoul   false
```
분 단위 정각(`0 * * * *`)에는 모든 일이 한꺼번에 몰리므로, 위처럼 애매한 분을 고르는 것이 좋다. `suspend: true`로 일정을 잠시 멈출 수 있다.

## 데몬셋
노드마다 하나씩 돌아야 하는 것이 있다. 노드의 로그 파일을 읽어 보내는 수집기, 노드의 CPU·디스크를 재는 노드 익스포터(모니터링 시리즈 7편), 네트워크 플러그인, 저장소 드라이버 같은 것이다. **데몬셋**은 노드가 생기면 그 노드에 파드를 하나 붙이고, 노드가 사라지면 함께 지운다. 레플리카 수가 아니라 노드 수가 개수를 정한다.
```yaml
# 파일: node-agent.yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: node-agent
spec:
  selector:
    matchLabels:
      app: node-agent
  template:
    metadata:
      labels:
        app: node-agent
    spec:
      tolerations:
        - operator: Exists              # 컨트롤 플레인 노드처럼 "taint"가 걸린 노드에도
      containers:
        - name: agent
          image: busybox:1.36
          command: ["sh", "-c", "echo \"$(cat /host/etc/hostname | wc -c) 바이트짜리 호스트 이름을 읽음\"; sleep 3600"]
          volumeMounts:
            - name: host-etc
              mountPath: /host/etc
              readOnly: true
      volumes:
        - name: host-etc
          hostPath:
            path: /etc                 # 노드의 파일을 읽는다(데몬셋의 대표적인 hostPath 사용)
```
```bash
kubectl apply -f node-agent.yaml > /dev/null && kubectl rollout status daemonset/node-agent --timeout=120s > /dev/null
kubectl get daemonset node-agent -o jsonpath='노드 {.status.desiredNumberScheduled}개, 파드 {.status.numberReady}개 준비{"\n"}'
echo "노드 수: $(kubectl get nodes --no-headers | wc -l)"
kubectl logs daemonset/node-agent | sed -E 's/^[0-9]+/…/'
kubectl delete -f node-agent.yaml --now > /dev/null; kubectl delete pods -l app=node-agent --now > /dev/null
```
```text
노드 1개, 파드 1개 준비
노드 수: 1
… 바이트짜리 호스트 이름을 읽음
```
이 클러스터는 노드가 하나라 파드도 하나다. 노드가 10개인 클러스터에서는 같은 설정으로 10개가 된다. `nodeSelector`나 노드 어피니티로 일부 노드에만 붙일 수도 있다. 데몬셋은 노드를 다루는 만큼 `hostPath`나 높은 권한을 쓰는 경우가 많으니, 꼭 필요한 것만 열어 준다.

## 흔한 오해
- "배치 작업도 디플로이먼트로 돌리면 된다": 끝난 컨테이너를 계속 다시 띄운다. 끝나는 일은 잡으로 한다.
- "크론잡은 정확히 한 번 실행된다": 드물게 두 번 실행되거나 놓칠 수 있다. 크론잡의 일은 멱등하게 만들고, 겹침 정책을 정한다.
- "데몬셋 파드는 모든 노드에 자동으로 뜬다": taint가 걸린 노드에는 그에 맞는 toleration이 있어야 뜬다.

## 어디에 쓰이나
- 웹 앱의 원리 14편 「오래 걸리는 업무 처리: 작업 큐, 재시도, 멱등 키」: 잡과 크론잡으로 돌리는 일을 다시 시도해도 안전하게 만드는 법을 본다.
- Prometheus와 Grafana 모니터링 7편 「노드 익스포터와 USE·RED: 무엇을 볼 것인가」: 데몬셋으로 노드마다 띄우는 대표적인 에이전트다.
- GitHub 협업과 자동화 6편 「GitHub Actions 1: 워크플로, 이벤트, 잡, 스텝」: 일정(`schedule`)과 매트릭스로 일을 나눠 돌리는 다른 시스템과 비교해 본다.

## 정리
- 끝나는 일은 잡이 맡는다. 완료 횟수, 병렬 수, 재시도 한계, 인덱스로 일을 나눈다.
- 크론잡은 일정마다 잡을 만들고, 시간대와 겹침 정책을 정한다. `create job --from`으로 바로 돌려 볼 수 있다.
- 데몬셋은 노드마다 파드 하나를 붙인다. 개수는 노드 수가 정한다.
- 셋 모두 다시 실행될 수 있으므로 일을 멱등하게 만든다.

## 더 알아보기
- 이전 글: 11편 「오토스케일링: HPA, 메트릭, 노드 늘리기」
- 다음 글: 13편 「네임스페이스, RBAC, 네트워크 정책: 나누고 막기」
