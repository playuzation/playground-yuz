# [쿠버네티스 실무 8/14] 볼륨과 StatefulSet: 파드가 사라져도 남는 데이터

> **한 줄 요약** — 컨테이너의 파일 시스템과 `emptyDir`은 파드와 함께 사라지므로, 남겨야 하는 데이터는 PersistentVolumeClaim(PVC)으로 저장소를 요청해 붙이고, 데이터베이스처럼 파드마다 자기 이름과 자기 디스크가 있어야 하는 앱은 StatefulSet으로 `db-0`, `db-1`처럼 고정된 이름·DNS·볼륨을 짝지어 준다.

## 이 글에서 다루는 것
- 볼륨의 종류: 파드와 함께 사라지는 것, 남는 것
- PV, PVC, StorageClass: 저장소를 요청하는 방식
- 직접 해 보기: 파드를 지워도 남는 파일
- StatefulSet: 고정된 이름, 순서, 파드마다의 볼륨
- 직접 해 보기: `db-1`을 지워도 같은 데이터로 돌아온다

## 사라지는 것과 남는 것
컨테이너 안에 쓴 파일은 컨테이너가 다시 시작되면 사라진다. 파드에 붙이는 **볼륨**에는 여러 종류가 있다.
- `emptyDir`: 파드가 만들어질 때 생기는 빈 폴더. 컨테이너가 재시작되어도 남지만 **파드가 지워지면 사라진다**. 3편에서 컨테이너끼리 파일을 나눌 때 썼다.
- `configMap`, `secret`: 7편처럼 오브젝트의 내용을 파일로 넣는다.
- `hostPath`: 노드의 폴더를 그대로 붙인다. 파드가 다른 노드로 옮겨 가면 데이터가 없고, 노드를 건드릴 수 있어 위험하다. 노드 관리용 데몬셋(12편) 말고는 쓰지 않는다.
- `persistentVolumeClaim`: 파드와 따로 사는 저장소. 파드가 지워지고 다른 노드에 새로 떠도 같은 데이터를 붙인다.

## PV, PVC, StorageClass
- **PersistentVolume(PV)**: 실제 저장소 하나(클라우드 디스크, NFS 공유, 노드의 디스크 등)를 나타내는 오브젝트.
- **PersistentVolumeClaim(PVC)**: "10GiB짜리, 한 노드에서 읽고 쓰는 저장소가 필요하다"는 **요청**. 앱 개발자는 PVC만 쓴다.
- **StorageClass**: 요청이 오면 PV를 **자동으로 만들어 주는** 방식. 클라우드라면 디스크 종류(SSD, 처리량)를 고르는 것과 같다.

PVC가 요청하고, StorageClass의 제공자가 PV를 만들고, 둘이 묶인다(Bound). k3s에는 노드의 디스크에 폴더를 만들어 주는 `local-path`가 기본 StorageClass로 들어 있다.
```bash
kubectl get storageclass -o custom-columns=NAME:.metadata.name,PROVISIONER:.provisioner,BINDING:.volumeBindingMode,RECLAIM:.reclaimPolicy
```
```text
NAME         PROVISIONER             BINDING                RECLAIM
local-path   rancher.io/local-path   WaitForFirstConsumer   Delete
```
`WaitForFirstConsumer`는 그 PVC를 쓰는 파드가 노드에 배정될 때까지 PV 만들기를 미룬다. 노드에 묶인 저장소를 엉뚱한 노드에 만들지 않기 위해서다. `Delete`는 PVC를 지우면 PV와 데이터도 지운다는 뜻이다(`Retain`이면 남긴다).

## 직접 해 보기: 파드를 지워도 남는 파일
PVC를 만들고, 그 PVC를 붙인 파드가 파일에 한 줄을 쓴다. 파드를 지우고 새 파드를 붙이면 그 줄이 남아 있을까.
```yaml
# 파일: notes.yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: notes
spec:
  accessModes: ["ReadWriteOnce"]     # 한 노드에서 읽고 쓰기
  resources:
    requests:
      storage: 1Gi
---
apiVersion: v1
kind: Pod
metadata:
  name: writer
spec:
  containers:
    - name: app
      image: busybox:1.36
      command: ["sh", "-c", "echo \"$(hostname) 다녀감\" >> /data/notes.txt; sleep 3600"]
      volumeMounts:
        - name: data
          mountPath: /data
  volumes:
    - name: data
      persistentVolumeClaim:
        claimName: notes
```
```bash
kubectl apply -f notes.yaml > /dev/null
kubectl wait --for=condition=Ready pod/writer --timeout=120s > /dev/null
kubectl get pvc notes -o custom-columns=NAME:.metadata.name,STATUS:.status.phase,CAPACITY:.status.capacity.storage
kubectl delete pod writer --now > /dev/null
sed 's/name: writer/name: writer-2/' notes.yaml | kubectl apply -f - > /dev/null
kubectl wait --for=condition=Ready pod/writer-2 --timeout=120s > /dev/null
kubectl exec writer-2 -- cat /data/notes.txt
kubectl delete pod writer-2 --now > /dev/null; kubectl delete pvc notes > /dev/null
```
```text
NAME    STATUS   CAPACITY
notes   Bound    1Gi
writer 다녀감
writer-2 다녀감
```
첫 파드가 쓴 줄이 두 번째 파드에도 남아 있다. 데이터는 PVC에 붙어 있고, 파드는 그것을 빌려 쓴다. 마지막에 PVC를 지웠으므로(`Delete` 정책) 데이터도 함께 지워졌다.

접근 방식(`accessModes`)은 저장소가 할 수 있는 것에 따라 고른다. `ReadWriteOnce`(한 노드), `ReadOnlyMany`(여러 노드에서 읽기), `ReadWriteMany`(여러 노드에서 쓰기, NFS 같은 공유 파일 시스템이 필요). 클라우드의 블록 디스크는 대부분 `ReadWriteOnce`다.

## StatefulSet
디플로이먼트의 파드는 서로 바꿔 끼워도 되는 똑같은 일꾼이다. 이름에 임의 문자열이 붙고, 아무 순서로나 뜨고 내려간다. 데이터베이스 클러스터는 다르다. "1번 복제본은 자기 디스크를 가지고 있고, 0번을 주 서버로 안다" 같은 **정체성**이 필요하다. **StatefulSet**이 그것을 준다.
- **고정된 이름**: `db-0`, `db-1`, `db-2`. 지워져 다시 만들어져도 같은 이름이다.
- **고정된 DNS**: 헤드리스 서비스(5편)와 짝지어 `db-0.db.default.svc.cluster.local`처럼 파드마다 주소가 생긴다.
- **파드마다의 볼륨**: `volumeClaimTemplates`로 파드마다 PVC(`data-db-0`, …)를 만들고, 같은 번호의 파드에 늘 같은 PVC를 붙인다.
- **순서**: 기본으로 0번부터 하나씩 준비된 뒤 다음을 만들고, 줄일 때는 큰 번호부터 지운다.

## 직접 해 보기: StatefulSet
파드마다 시작할 때 자기 볼륨에 "시작한 횟수"를 늘려 적는 작은 StatefulSet을 만든다.
```yaml
# 파일: db.yaml
apiVersion: v1
kind: Service
metadata:
  name: db
spec:
  clusterIP: None              # 헤드리스: 파드마다 DNS 이름
  selector:
    app: db
  ports:
    - port: 8080
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: db
spec:
  serviceName: db
  replicas: 3
  selector:
    matchLabels:
      app: db
  template:
    metadata:
      labels:
        app: db
    spec:
      containers:
        - name: db
          image: busybox:1.36
          command: ["sh", "-c", "n=$(cat /data/starts 2>/dev/null || echo 0); echo $((n + 1)) > /data/starts; sleep 3600"]
          volumeMounts:
            - name: data
              mountPath: /data
  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes: ["ReadWriteOnce"]
        resources:
          requests:
            storage: 1Gi
```
```bash
kubectl apply -f db.yaml > /dev/null
kubectl rollout status statefulset/db --timeout=180s > /dev/null
kubectl get pods -l app=db --sort-by=.metadata.creationTimestamp -o custom-columns=POD:.metadata.name
kubectl get pvc -l app=db -o custom-columns=PVC:.metadata.name,STATUS:.status.phase --sort-by=.metadata.name
kubectl run lookup --image=busybox:1.36 --restart=Never -- sleep 600 > /dev/null && kubectl wait --for=condition=Ready pod/lookup > /dev/null
kubectl exec lookup -- nslookup db-1.db.default.svc.cluster.local | grep -c '^Address: [0-9]'
```
```text
POD
db-0
db-1
db-2
PVC         STATUS
data-db-0   Bound
data-db-1   Bound
data-db-2   Bound
1
```
파드는 0, 1, 2 순서로 만들어졌고, 각자의 PVC가 묶였다. `db-1`은 자기만의 DNS 이름으로 찾아진다. 이제 `db-1`을 지운다.
```bash
old_ip=$(kubectl get pod db-1 -o jsonpath='{.status.podIP}')
kubectl delete pod db-1 --now > /dev/null
kubectl wait --for=condition=Ready pod/db-1 --timeout=120s > /dev/null
echo "다시 생긴 파드: $(kubectl get pod db-1 -o jsonpath='{.metadata.name}, PVC {.spec.volumes[0].persistentVolumeClaim.claimName}')"
for p in db-0 db-1 db-2; do echo "$p 시작 횟수: $(kubectl exec $p -- cat /data/starts)"; done
```
```text
다시 생긴 파드: db-1, PVC data-db-1
db-0 시작 횟수: 1
db-1 시작 횟수: 2
db-2 시작 횟수: 1
```
`db-1`이 **같은 이름**으로 돌아와 **같은 PVC**를 다시 붙였다. 그래서 그 볼륨에 남아 있던 횟수 1을 읽고 2로 늘렸다. IP는 바뀌었을 수 있지만 DNS 이름은 같으므로 다른 복제본은 여전히 `db-1.db`로 찾는다.

개수를 줄이면 PVC는 어떻게 될까.
```bash
kubectl scale statefulset db --replicas=2 > /dev/null
until ! kubectl get pod db-2 > /dev/null 2>&1; do sleep 1; done
kubectl get pvc -l app=db -o custom-columns=PVC:.metadata.name --no-headers | sort | paste -sd' '
kubectl delete -f db.yaml --now > /dev/null; kubectl delete pod lookup --now > /dev/null
kubectl delete pvc -l app=db > /dev/null
```
```text
data-db-0 data-db-1 data-db-2
```
`db-2`는 사라졌지만 `data-db-2`는 **남았다**. 다시 3개로 늘리면 같은 데이터를 다시 붙인다. 데이터를 실수로 지우지 않기 위한 기본값이고(`persistentVolumeClaimRetentionPolicy`로 바꿀 수 있다), StatefulSet을 지워도 PVC는 남으므로 마지막 줄처럼 따로 지운다.

StatefulSet은 이름과 디스크를 지켜 줄 뿐, 복제와 장애 조치는 앱이 직접 해야 한다. 주 서버를 정하고, 복제본이 따라오게 하고, 주 서버가 죽으면 넘기는 일이다(PostgreSQL 실무 15편, Redis 실무 8편). 그래서 운영 데이터베이스는 관리형 서비스를 쓰거나, 이 일을 대신하는 **오퍼레이터**(CloudNativePG, Strimzi 같은 전용 컨트롤러)를 함께 쓰는 경우가 많다.

## 흔한 오해
- "`emptyDir`에 두면 재시작해도 남으니 충분하다": 파드가 다른 노드로 옮겨 가거나 지워지면 사라진다. 남겨야 하는 데이터는 PVC에 둔다.
- "StatefulSet이면 데이터베이스가 알아서 복제된다": 이름, DNS, 볼륨만 고정해 준다. 복제는 데이터베이스나 오퍼레이터의 몫이다.
- "PVC를 지워도 데이터는 어딘가 남는다": 정책이 `Delete`면 PV와 실제 디스크까지 지워진다. 중요한 데이터는 `Retain`과 백업으로 지킨다.

## 어디에 쓰이나
- 도커와 컨테이너 7편 「볼륨과 바인드 마운트: 데이터는 컨테이너 밖에 둔다」: 컨테이너 밖에 데이터를 두는 같은 원칙을 도커에서 본다.
- PostgreSQL 실무 15편 「복제와 고가용성: 스트리밍 복제, 논리 복제, 장애 조치」: StatefulSet 위에서 데이터베이스가 직접 해야 하는 복제와 장애 조치를 본다.
- 카프카 이벤트 스트리밍 8편 「복제와 장애 조치: 리더, 팔로워, ISR」: 브로커마다 고정된 ID와 디스크가 필요한 카프카가 StatefulSet의 대표적인 사용자다.

## 정리
- 컨테이너 파일과 `emptyDir`은 파드와 함께 사라진다. 남길 데이터는 PVC로 요청한 저장소에 둔다.
- PVC는 요청, PV는 실제 저장소, StorageClass는 PV를 자동으로 만드는 방식이다. 회수 정책을 확인한다.
- StatefulSet은 파드마다 고정된 이름, DNS, 볼륨을 주고 순서대로 만들고 줄인다. 줄여도 PVC는 남는다.
- 복제와 장애 조치는 앱이나 오퍼레이터가 맡는다.

## 더 알아보기
- 이전 글: 7편 「ConfigMap과 Secret: 설정과 비밀을 이미지 밖으로」
- 다음 글: 9편 「리소스 요청과 제한: 스케줄링, QoS, OOMKilled」
