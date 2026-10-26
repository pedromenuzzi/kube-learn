// As explicações do terminal em inglês (o gêmeo de src/k8s/explicacoes.js, na mesma ordem e com as mesmas expressões).
// Mudou uma regra lá? Mude aqui também: tests/i18n.test.js confere.

export const REGRAS = [
  {
    re: /forbidden: User "([^"]+)" cannot (\w+) resource "([^"]+)" in API group "([^"]*)" (in the namespace "[^"]+"|at the cluster scope)/,
    t: (m) => ({ titulo: `“${m[1]}” doesn’t have a badge for that`, texto: `Nobody gave them <code>${m[2]}</code> permission on <code>${m[3]}</code> ${m[5].startsWith('in') ? m[5] : 'across the cluster'}. Permission comes from a Role (or ClusterRole) handed out by a RoleBinding (or ClusterRoleBinding). Test it with <code>kubectl auth can-i ${m[2]} ${m[3]} --as=${m[1]}</code>.`, vidaReal: 'The turnstile doesn’t recognize the badge: it doesn’t open this door.' }),
  },
  {
    re: /error looking up service account ([\w-]+)\/([\w.-]+)/,
    t: (m) => ({ titulo: `The ServiceAccount “${m[2]}” doesn’t exist`, texto: `The pod asks for the <code>${m[2]}</code> badge in the <code>${m[1]}</code> namespace, and it was never created. Create it before the pod (in the same file, the ServiceAccount goes first): <code>kubectl create serviceaccount ${m[2]} -n ${m[1]}</code>.`, vidaReal: 'The resident showed up with a badge the management office never issued.' }),
  },
  {
    re: /unsupported role reference kind: "([^"]*)"/,
    t: (m) => ({ titulo: m[1] ? `“${m[1]}” isn’t a kind of badge` : 'Which badge to hand out is missing', texto: 'The binding’s <code>roleRef</code> says which badge it hands out: <code>kind</code> (<code>Role</code> or <code>ClusterRole</code>, capitalized), <code>name</code> and <code>apiGroup: rbac.authorization.k8s.io</code>. Without one of those kinds, the API Server refuses it before looking at the rest.', vidaReal: 'A badge hand-over form that doesn’t say which badge.' }),
  },
  {
    re: /violates PodSecurity "(\w+):/,
    t: (m) => ({ titulo: `The namespace’s fire code (${m[1]}) rejected the pod`, texto: 'The message lists what’s missing, item by item (the field and the expected value). Under <code>restricted</code>, it’s almost always: <code>runAsNonRoot</code>, <code>allowPrivilegeEscalation: false</code>, <code>capabilities.drop: ["ALL"]</code> and <code>seccompProfile.type: RuntimeDefault</code>.', vidaReal: 'The block’s fire marshals stopped the move: safety gear is missing.' }),
  },
  {
    re: /metadata\.labels\[pod-security\.kubernetes\.io\/(\w+)(-version)?\]: Invalid value: "([^"]*)"/,
    t: (m) => ({ titulo: `"${m[3]}" is not valid in the PodSecurity label`, texto: m[2] ? 'The policy version is <code>latest</code> or <code>v1.N</code> (like <code>v1.37</code>). The namespace stayed as it was.' : 'The level is lowercase and one of these three: <code>privileged</code>, <code>baseline</code> or <code>restricted</code>. The namespace stayed as it was.', vidaReal: 'The building’s rules have only three levels of strictness; a made-up fourth one isn’t registered by the management.' }),
  },
  {
    re: /Error from server \(NotFound\): (?:error when \w+ "[^"]+": )?([\w.]+) "([^"]+)" not found/,
    t: (m) => m[1].startsWith('namespaces')
      ? { titulo: `The namespace “${m[2]}” doesn’t exist`, texto: `Create it with <code>kubectl create namespace ${m[2]}</code> or check the name.`, vidaReal: 'Sending a letter to a company that has no office in the building.' }
      : { titulo: `Nothing in ${m[1].split('.')[0]} is named “${m[2]}”`, texto: `Check the name with <code>kubectl get ${m[1].split('.')[0]}</code> and the namespace (<code>-n</code>).`, vidaReal: 'The doorman (API Server) looked in the book and found no one by that name.' },
  },
  {
    re: /AlreadyExists\).*?([\w.]+) "([^"]+)" already exists/,
    t: (m) => ({ titulo: `“${m[2]}” already exists`, texto: '<code>create</code> only creates. To update an object that already exists, use <code>kubectl apply -f</code>: it compares and changes only what’s different.', vidaReal: 'Asking to build an apartment that’s already built.' }),
  },
  {
    re: /(?:cannot be handled as a (\w+): )?strict decoding error: (unknown field .*)/,
    t: (m, { parecido } = {}) => {
      const campos = [...m[2].matchAll(/unknown field &quot;(.*?)&quot;/g)].map((x) => x[1]);
      const sugestoes = [...new Set(campos.map((c) => parecido?.(m[1], c)).filter(Boolean))];
      return {
        titulo: 'A field that doesn’t exist',
        texto: `Kubernetes doesn’t know the ${campos.length > 1 ? 'fields' : 'field'} ${campos.map((c) => `<code>${c}</code>`).join(', ')}. ${sugestoes.length ? `Did you mean ${sugestoes.map((x) => `<code>${x}</code>`).join(' and ')}?` : 'It’s usually a typo (<code>replica</code> instead of <code>replicas</code>) or wrong indentation, which puts the field inside the wrong block.'} The Manual tab shows the right names.`,
        vidaReal: 'A form with a made-up field: the management office sends it back unprocessed.',
      };
    },
  },
  {
    re: /cannot unmarshal (\w+) into Go struct field \w+\.([\w.]+) of type (\S+)/,
    t: (m) => ({ titulo: `Wrong type in ${m[2]}`, texto: `The field expects <code>${m[3]}</code> and got ${m[1] === 'string' ? 'text (remove the quotes)' : m[1] === 'number' ? 'a number (put it in quotes)' : m[1]}.`, vidaReal: 'Writing “three” in a field that asks for a number.' }),
  },
  {
    re: /`selector` does not match template `labels`/,
    t: () => ({ titulo: 'The selector doesn’t match the template’s labels', texto: '<code>spec.selector.matchLabels</code> must be among the template’s <code>labels</code>. Otherwise, the Deployment would create pods it doesn’t recognize as its own.', vidaReal: 'The contract says “team: support”, but the door signs say something else: the inspector would never find the rooms.' }),
  },
  {
    re: /exceeded quota: ([\w-]+)/,
    t: (m) => ({ titulo: `This exceeds the namespace’s “${m[1]}” quota`, texto: 'The total of what the namespace’s pods request would go over the ceiling. Check usage with <code>kubectl describe quota</code>: lower the requests/limits or the replicas, or ask for more quota.', vidaReal: 'The company has already used up the power quota the condo gave it.' }),
  },
  {
    re: /failed quota: ([\w-]+): must specify ([^\n]+)/,
    t: (m) => ({ titulo: 'The quota requires declaring consumption', texto: `With a CPU or memory quota, every container must say how much it requests and how much it may use. Missing: <code>${m[2]}</code>. Put it in <code>resources</code>, or create a LimitRange with default values.`, vidaReal: 'An appliance without an energy label doesn’t get into the condo.' }),
  },
  {
    re: /maximum (\w+) usage per Container is ([\w.]+), but limit is ([\w.]+)/,
    t: (m) => ({ titulo: `Over the ${m[1]} ceiling per container`, texto: `The namespace’s LimitRange accepts at most ${m[2]} and the container asked for ${m[3]}. Lower <code>limits.${m[1]}</code>.`, vidaReal: 'The condo’s rules forbid a circuit breaker bigger than allowed.' }),
  },
  {
    re: /resources\.requests: Invalid value: "([^"]+)": must be less than or equal to ([\w./-]+) limit of (\S+)/,
    t: (m) => ({ titulo: `The ${m[2]} request is above the limit`, texto: `<code>requests.${m[2]}</code> (${m[1]}) is what the container is guaranteed; <code>limits.${m[2]}</code> (${m[3]}) is the ceiling. Guaranteeing more than the ceiling makes no sense, so the API Server refuses it: lower the request or raise the limit.`, vidaReal: 'Contracting 10 kW of power with a 5 kW circuit breaker: it would trip before reaching what you paid for.' }),
  },
  {
    re: /resources\.(?:requests|limits)\[([^\]]+)\]: Invalid value: "[^"]*": must be a standard resource for containers/,
    t: (m) => ({ titulo: `"${m[1]}" is not a container resource`, texto: 'Without a domain in front, a container can only ask for <code>cpu</code>, <code>memory</code>, <code>ephemeral-storage</code> and <code>hugepages-*</code>, exactly like that, singular and lowercase. Devices (such as GPUs) carry the vendor’s name: <code>nvidia.com/gpu</code>.', vidaReal: 'The utility form only has lines for power, water and gas: “powers” isn’t one of them.' }),
  },
  {
    re: /Metrics API not available/,
    t: () => ({ titulo: 'Nobody is measuring consumption', texto: '<code>kubectl top</code> and the HPA depend on metrics-server, which kind doesn’t ship with. On a real cluster: <code>kubectl apply -f</code> metrics-server’s components.yaml.', vidaReal: 'Asking for a meter reading in a building with no meter reader.' }),
  },
  {
    re: /restartPolicy: Required value: valid values: "OnFailure", "Never"/,
    t: () => ({ titulo: 'A Job doesn’t accept restartPolicy Always', texto: 'A Job has to finish: use <code>restartPolicy: Never</code> (each failure becomes a new pod) or <code>OnFailure</code> (the container restarts in the same pod). Always is for things that must never stop.', vidaReal: 'A one-off contract with a “when you finish, start over” clause: that’s a full-time job, not a one-off.' }),
  },
  {
    re: /spec\.schedule: Invalid value: "([^"]*)": (.*)/,
    t: (m) => ({ titulo: 'The CronJob’s schedule isn’t in cron format', texto: `It’s 5 space-separated fields: minute hour day month weekday (e.g. <code>*/5 * * * *</code>, <code>0 3 * * *</code>). The apiserver said: ${m[2]}.`, vidaReal: 'Booking the pickup for “sometime in the morning”: the truck needs a day and a time.' }),
  },
  {
    re: /volumeMounts\[\d+\]\.name: Not found: "([^"]+)"/,
    t: (m) => ({ titulo: `The container mounts the volume “${m[1]}”, which the pod doesn’t have`, texto: 'Each <code>volumeMounts[].name</code> must be the name of a volume in <code>spec.volumes</code> (in the same pod). Check the spelling in both places.', vidaReal: 'Asking to install a cabinet in the apartment that isn’t on the moving list.' }),
  },
  {
    re: /PersistentVolumeClaim "[^"]+" is invalid: spec: Forbidden: spec is immutable/,
    t: () => ({ titulo: 'A storage request can’t change once it’s made', texto: 'On a PVC, you can only increase the size. To change the class or access mode: <code>kubectl delete pvc NAME</code> and create it again (careful: the data goes with it, if the policy is Delete).', vidaReal: 'The storage unit contract is already signed: to switch units, you cancel and sign a new one.' }),
  },
  {
    re: /roleRef: Invalid value: .*: field is immutable/,
    t: () => ({ titulo: 'The roleRef doesn’t change after creation', texto: 'A binding always hands out the same badge. To switch, delete it and create it again: <code>kubectl delete rolebinding NAME</code> (or <code>clusterrolebinding</code>) and apply again.', vidaReal: 'To change someone’s badge, the front desk takes back the old one and issues another: you can’t rewrite what’s on the card.' }),
  },
  {
    re: /field is immutable|Forbidden: updates to statefulset spec/,
    t: () => ({ titulo: 'This field can’t change after creation', texto: 'Some fields are fixed. In a StatefulSet, <code>volumeClaimTemplates</code> and <code>serviceName</code> don’t change: delete it (<code>kubectl delete sts NAME</code>; the PVCs stay) and create it again.', vidaReal: 'The building’s blueprint has already been approved: changing the garage takes a new design.' }),
  },
  {
    re: /pod updates may not change fields/,
    t: () => ({ titulo: 'A pod can’t change after creation', texto: 'In a pod, only the image can change. To change the rest (volumes, command, ports): <code>kubectl delete pod NAME</code> and apply again. With a Deployment, this happens on its own.', vidaReal: 'The apartment is already furnished: to change the floor plan, the resident moves out and the apartment is rebuilt.' }),
  },
  {
    re: /Read-only file system/,
    t: () => ({ titulo: 'This volume is read-only', texto: 'A ConfigMap or Secret mounted as a volume is always read-only (changes come from the object, not from inside the pod). To write, use an <code>emptyDir</code> or a PVC.', vidaReal: 'The bulletin board is behind glass: only the management office changes the notices.' }),
  },
  {
    re: /nonexistent directory|Directory nonexistent/,
    t: () => ({ titulo: 'The folder doesn’t exist in the container', texto: 'The image doesn’t have this folder. Mount a volume there (<code>volumeMounts</code>) or write to a folder that exists, like <code>/tmp</code>.', vidaReal: 'Storing the box in a storage unit nobody rented.' }),
  },
  {
    re: /is invalid: .*?([\w.[\]]+): Required value/,
    t: (m) => ({ titulo: `A required field is missing: ${m[1]}`, texto: 'This field can’t be empty. The Manual tab (or <code>kubectl explain</code>) shows what goes in it.', vidaReal: 'A form with a required field left blank.' }),
  },
  {
    re: /([\w.[\]]+): Unsupported value: "([^"]*)": supported values: (.+)/,
    t: (m) => ({ titulo: `"${m[2]}" is not an accepted value for ${m[1].split('.').pop()}`, texto: `The <code>${m[1]}</code> field only accepts these values, spelled exactly like this (capital letters included): ${m[3].replace(/&quot;([^&]*)&quot;/g, '<code>$1</code>')}.`, vidaReal: 'Ticking “maybe” on a form that only has yes and no boxes.' }),
  },
  {
    re: /found character that cannot start any token/,
    t: () => ({ titulo: 'There’s a TAB in the YAML', texto: 'YAML only accepts spaces for indentation. Replace the TAB with 2 spaces.', vidaReal: 'The blueprint was drawn with a ruler of a different size: the inspector can’t read it.' }),
  },
  {
    re: /mapping values are not allowed|did not find expected key/,
    t: () => ({ titulo: 'The YAML indentation is off', texto: 'In YAML, indentation says what’s inside what. Check the spaces on the line shown and the one above it, and whether a space is missing after <code>:</code>.', vidaReal: 'A blueprint with misaligned walls: you can’t tell which room is inside which.' }),
  },
  {
    re: /the server doesn't have a resource type "([^"]+)"/,
    t: (m) => ({ titulo: `There’s no type “${m[1]}”`, texto: 'See the types (and their short names, like <code>po</code>, <code>deploy</code>, <code>svc</code>) with <code>kubectl api-resources</code>.', vidaReal: 'Asking the front gate for a service the condo doesn’t offer.' }),
  },
  {
    re: /no matches for kind "(\w+)" in version "([^"]+)"/,
    t: (m) => ({ titulo: `apiVersion and kind don’t match: ${m[1]} isn’t ${m[2]}`, texto: 'Each type lives in an API version: Pod and Service in <code>v1</code>; Deployment and ReplicaSet in <code>apps/v1</code>. Check <code>kubectl api-resources</code>.', vidaReal: 'Sending the request to the wrong department of the management office.' }),
  },
  {
    re: /unknown command "([^"]+)" for "kubectl"/,
    t: (m) => ({ titulo: `kubectl doesn’t have the command “${m[1]}”`, texto: 'Type <code>kubectl help</code> to see the commands.', vidaReal: 'Talking to the doorman in a language he doesn’t understand.' }),
  },
  {
    re: /is waiting to start: (ContainerCreating|trying and failing to pull image|CreateContainerConfigError)/,
    t: (m) => ({ titulo: 'The container hasn’t started yet', texto: m[1] === 'ContainerCreating' ? 'Wait a few seconds (the image is being pulled) and try again.' : 'It never got to run, so there’s no log. See why in <code>kubectl describe pod NAME</code>, under Events.', vidaReal: 'Reading the diary of a resident who hasn’t even moved in yet.' }),
  },
  {
    re: /executable file not found in \$PATH/,
    t: () => ({ titulo: 'The image doesn’t have that program', texto: 'Each image ships only what it needs. Minimal images (<i>distroless</i>) don’t even have a shell. Try another command (<code>wget</code> in busybox, <code>curl</code> in nginx) or use a test pod.', vidaReal: 'Looking for a tool in an apartment furnished with only the basics.' }),
  },
  {
    re: /unable to upgrade connection: container not found/,
    t: () => ({ titulo: 'The container isn’t running', texto: 'You can only get into a running container. Check the status with <code>kubectl get pod</code>.', vidaReal: 'Ringing the doorbell of an empty apartment.' }),
  },
  {
    re: /cannot delete DaemonSet-managed Pods/,
    t: () => ({ titulo: 'drain won’t touch DaemonSet pods unless you say so', texto: 'DaemonSet pods (kube-proxy, kindnet...) exist one per node, on purpose: removed, they’d come right back. Tell drain to leave them: <code>--ignore-daemonsets</code>. The node is already closed off (cordon).', vidaReal: 'The fire extinguisher belongs to the building: during the move, it stays.' }),
  },
  {
    re: /cannot delete Pods that declare no controller/,
    t: () => ({ titulo: 'A pod with no owner: if it leaves, it doesn’t come back', texto: 'This pod has no Deployment (or other controller) behind it: once evicted, it’s gone for good. If that’s really what you want, use <code>--force</code>; better yet, run it in a Deployment.', vidaReal: 'A resident with no lease: if they leave during the renovation, nobody holds their spot.' }),
  },
  {
    re: /cannot delete Pods with local storage/,
    t: () => ({ titulo: 'The pod has data in an emptyDir', texto: 'Whatever is in the emptyDir goes away with the pod. If you can afford to lose it, use <code>--delete-emptydir-data</code>.', vidaReal: 'The work desk doesn’t come along on the move: whatever’s on top of it is lost.' }),
  },
  {
    re: /global timeout reached/,
    t: () => ({ titulo: 'drain gave up waiting', texto: 'Some pod didn’t leave in time: a PodDisruptionBudget with no slack (minAvailable equal to the replicas, or replicas with nowhere to go) or a pod on a node that doesn’t respond. Check <code>kubectl get pdb</code> and <code>kubectl get pods -o wide</code>.', vidaReal: 'The move stalled: the agreement won’t let anyone else out, and there’s nowhere to go.' }),
  },
  {
    re: /already has ([\w./-]+) taint\(s\) with same effect/,
    t: (m) => ({ titulo: `The node already has the “${m[1]}” sign`, texto: `To change the value, use <code>--overwrite</code>; to remove it, add a “-” at the end: <code>kubectl taint nodes NODE ${m[1]}-</code>.`, vidaReal: 'Hanging a sign where an identical one is already up.' }),
  },
  {
    re: /taint "([^"]+)" not found/,
    t: (m) => ({ titulo: `The node doesn’t have the “${m[1]}” sign`, texto: 'See the signs on the <code>Taints</code> line of <code>kubectl describe node NAME</code>.', vidaReal: 'Taking down a sign that isn’t on the door.' }),
  },
  {
    re: /invalid taint (?:spec|effect)/,
    t: () => ({ titulo: 'The taint is badly written', texto: 'The format is <code>key=value:Effect</code> (or <code>key:Effect</code>), with Effect NoSchedule, PreferNoSchedule or NoExecute. To remove it, <code>key-</code>.', vidaReal: 'A sign that doesn’t say what it forbids.' }),
  },
  {
    re: /no PriorityClass with name ([\w.-]+) was found/,
    t: (m) => ({ titulo: `The PriorityClass “${m[1]}” doesn’t exist`, texto: 'Create the class before the pod (in the same file, it can come first, separated by <code>---</code>). <code>kubectl get priorityclass</code> lists the ones that exist.', vidaReal: 'Showing a “priority” badge the management office never issued.' }),
  },
  {
    re: /namespaces "[^"]+" is forbidden: this namespace may not be deleted/,
    t: () => ({ titulo: 'That namespace belongs to the system', texto: '<code>default</code>, <code>kube-system</code> and <code>kube-public</code> can’t be deleted.', vidaReal: 'Trying to demolish the condo’s management office.' }),
  },
  {
    re: /spec\.timeZone: Invalid value: "([^"]+)": unknown time zone/,
    t: (m) => ({ titulo: `“${m[1]}” isn’t a time zone`, texto: 'A CronJob’s <code>timeZone</code> uses the names from the time zone database (IANA), with the region and the city: <code>America/Sao_Paulo</code>, <code>Europe/Lisbon</code>, <code>Etc/UTC</code>. Without the field, the kube-controller-manager’s time zone applies (almost always UTC).', vidaReal: 'Scheduling the meeting “at 9 a.m. Mars time”: nobody knows what time it is there.' }),
  },
  {
    re: /^error: ([\w.]+) "([^"]+)" is invalid$/m,
    t: (m) => ({ titulo: 'kubectl edit opened the file again', texto: `The server rejected the change to <code>${m[2]}</code>, and the reason is at the top of the file, on the lines starting with <code># *</code>. Fix it and save; or quit without saving to give up (then nothing changes in the cluster).`, vidaReal: 'The management office sent the form back with a note stapled to it saying what to fix.' }),
  },
  {
    re: /Edit cancelled, no valid changes were saved/,
    t: () => ({ titulo: 'Nothing was saved', texto: 'The server rejected the change and the editor closed without a fix: the object is just as it was. kubectl kept what you wrote in a file under <code>/tmp</code> (in a real terminal, you can reuse it). Run <code>kubectl edit</code> again.', vidaReal: 'You gave up on the returned form: the request stays as it was before.' }),
  },
  {
    re: /At least one of apiVersion, kind and name was changed/,
    t: () => ({ titulo: 'edit doesn’t change the name or the kind', texto: '<code>kubectl edit</code> changes an object that already exists; <code>name</code>, <code>kind</code> and <code>apiVersion</code> say which one it is. For an object with another name, create a new one: <code>kubectl get deploy web -o yaml &gt; new.yaml</code>, change the name in the editor and <code>kubectl apply -f new.yaml</code>.', vidaReal: 'Asking for a renovation of apartment 101 and changing the number to 102 on the form: the office no longer knows which apartment it’s about.' }),
  },
];

export const STATUS = [
  { re: /^Forwarding from 127\.0\.0\.1:(\d+)/m, titulo: 'Port-forward active', texto: 'A passage from your computer straight to the pod. Test it with <code>curl http://localhost:PORT</code> right here in the terminal (<code>curl</code> without kubectl runs on your computer). In a real terminal this command keeps running (Ctrl+C stops it) and you test from another terminal.', vidaReal: 'A temporary passage from your house straight to the apartment.' },
  { re: /\bCrashLoopBackOff\b/, titulo: 'CrashLoopBackOff: the container crashes and gets restarted', texto: 'The program exits right after starting, and the kubelet waits longer and longer before trying again (10s, 20s, 40s... up to 5 min). See why in <code>kubectl logs NAME --previous</code> and in <code>kubectl describe pod NAME</code>.', vidaReal: 'The resident faints every time they walk in, and the building manager waits longer and longer before trying again.' },
  { re: /\b(ImagePullBackOff|ErrImagePull)\b/, titulo: 'The image wasn’t pulled', texto: 'Wrong name or tag, or a private image. Check the image and see the exact error in <code>kubectl describe pod NAME</code>, under Events.', vidaReal: 'The prefab parts never arrived: the order had the wrong model.' },
  { re: /\bCreateContainerConfigError\b/, titulo: 'Configuration is missing to create the container', texto: 'Some ConfigMap or Secret used in <code>env</code> doesn’t exist (or doesn’t have the key). <code>kubectl describe pod NAME</code> tells you which.', vidaReal: 'The move got stuck because the envelope with the password never arrived.' },
  { re: /\bOOMKilled\b/, titulo: 'OOMKilled: it went over the memory limit', texto: 'The container used more memory than <code>limits.memory</code> and was killed (exit code 137). Either the limit is too low for the program, or the program leaks memory.', vidaReal: 'The circuit breaker tripped: too many appliances were turned on at once.' },
  { re: /<unknown>\/\d+%/, titulo: 'The HPA doesn’t know the usage yet', texto: 'In the first few seconds, that’s normal. If it persists: the pods need <code>resources.requests</code> (the percentage is of the request) and metrics-server needs to be running. <code>kubectl describe hpa</code> tells you why.', vidaReal: 'The temp-staff manager doesn’t know each clerk’s capacity: he can’t work out whether they’re swamped.' },
  { re: /\bInit:(Error|CrashLoopBackOff)\b/, titulo: 'An init container failed', texto: 'The pod doesn’t get past setup: the init container exited with an error and the kubelet tries again. See its log: <code>kubectl logs POD -c INIT_NAME</code>.', vidaReal: 'The inspection failed: the move waits outside until the inspection passes.' },
  { re: /\bBackoffLimitExceeded\b|reached the specified backoff limit/, titulo: 'The Job gave up', texto: 'It failed more times than <code>backoffLimit</code>. The pods’ logs (<code>kubectl logs job/NAME</code>) tell you why; fix it and create the Job again.', vidaReal: 'The bricklayer tried and tried, and the contract ran out before the wall was standing.' },
  { re: /MountVolume\.SetUp failed for volume/, titulo: 'The volume didn’t mount', texto: 'The ConfigMap or Secret the volume uses doesn’t exist (or has another name). The pod stays in ContainerCreating until it shows up: create the object or fix the name in <code>spec.volumes</code>.', vidaReal: 'The move is waiting for the cabinet that never arrived.' },
  { re: /pod has unbound immediate PersistentVolumeClaims|ProvisioningFailed/, titulo: 'The storage request wasn’t fulfilled', texto: 'The PVC is Pending: the requested StorageClass doesn’t exist (see <code>kubectl get sc</code>) or no PV fits. <code>kubectl describe pvc NAME</code> shows why.', vidaReal: 'They asked for a “climate-controlled” storage unit, but the condo only has regular ones.' },
  { re: /had untolerated taint/, titulo: 'Restriction sign: taint', texto: 'Some node has a taint the pod doesn’t tolerate (the control plane’s is normal). The <code>Taints</code> line of <code>kubectl describe node</code> shows the sign; either the pod gets a toleration, or the taint goes.', vidaReal: 'Restricted building: only those with authorization get in.' },
  { re: /didn't match Pod's node affinity\/selector/, titulo: 'No node has the requested labels', texto: 'The nodeSelector (or nodeAffinity) asks for labels the node doesn’t have. Compare with <code>kubectl get nodes --show-labels</code>: either the label goes on the node, or the request changes.', vidaReal: 'You asked for a building with a generator, and none has the generator sign on the door.' },
  { re: /didn't match pod anti-affinity rules|didn't satisfy existing pods anti-affinity rules/, titulo: 'Anti-affinity won’t allow it', texto: 'Every possible node already has a pod this one wants to stay away from. With <code>required</code>, it waits (Pending) until a free node shows up; with <code>preferred</code>, it would go anyway.', vidaReal: 'The two backup copies can’t share a building, and there’s no building left.' },
  { re: /didn't match pod topology spread constraints/, titulo: 'The spread won’t allow it', texto: 'Putting the pod there would exceed <code>maxSkew</code>. Watch out: nodes with a taint (like the control plane) count as an empty domain. With <code>whenUnsatisfiable: ScheduleAnyway</code>, it would go anyway.', vidaReal: 'The rule is not to let one neighborhood have many more shops than another.' },
  { re: /node\(s\) were unschedulable/, titulo: 'Node closed off', texto: 'Some node is cordoned (<code>SchedulingDisabled</code>): it doesn’t take new pods. <code>kubectl uncordon NODE</code> opens it back up.', vidaReal: 'Building closed off for renovation.' },
  { re: /\d+ Insufficient (?:cpu|memory)/, titulo: 'The nodes are short on CPU or memory', texto: 'The sum of the <b>requests</b> would go over what the node has. Check “Allocated resources” in <code>kubectl describe node</code>: lower the requests or the replicas, or give priority (PriorityClass) to what matters most.', vidaReal: 'The power contracted by all the apartments has already used up the building’s supply.' },
  { re: /violate the pod's disruption budget/, titulo: 'The PDB held back the eviction', texto: 'The PodDisruptionBudget won’t let anyone else leave right now: drain tries again every 5 s, while the replacements come up on another node. With no slack ever (minAvailable equal to the replicas), it waits forever.', vidaReal: 'At least 2 elevators running: the third only stops once the spare is ready.' },
  { re: /^\S+\s+Ready,SchedulingDisabled\s/m, titulo: 'Node closed off (cordon)', texto: 'It doesn’t take new pods; the ones already there stay. <code>kubectl uncordon NODE</code> opens it back up.', vidaReal: 'Building closed to new residents.' },
  { re: /^\S+\s+NotReady(?:,SchedulingDisabled)?\s/m, titulo: 'The node stopped reporting in', texto: 'The kubelet doesn’t respond (power, network, machine). About 5 minutes later, the pods there are evicted: the ones with an owner (Deployment, StatefulSet) are reborn on other nodes; the loose ones stay Terminating and don’t come back.', vidaReal: 'Power outage in the building.' },
  { re: /would violate PodSecurity/, titulo: 'Warning: the pods will be rejected', texto: 'The object was created, but its pods don’t pass the namespace’s fire code: the ReplicaSet will try and be rejected (READY 0/1). <code>kubectl describe rs -n NAMESPACE</code> shows the FailedCreate.', vidaReal: 'The contract was signed, but the fire marshals won’t let anyone in like that.' },
  { re: /container has runAsNonRoot and image will run as root/, titulo: 'The image runs as root', texto: 'The pod asks for <code>runAsNonRoot: true</code>, but the image runs as root (user 0). Set a regular user (<code>runAsUser: 1000</code>) or use an image built to run without root.', vidaReal: 'The rule is “no master key”, and the resident only has the master key.' },
  { re: /wget: bad address '[^']+'|Could not resolve host/, titulo: 'The name didn’t resolve', texto: 'Either the name is wrong (does the Service exist? in the same namespace?), or a NetworkPolicy closes the pod’s egress and forgot about DNS (port 53, UDP and TCP, to kube-dns).', vidaReal: 'The switchboard operator didn’t pick up: without the number, you can’t call.' },
  { re: /download timed out|Connection timed out|connection timed out; no servers could be reached/, titulo: 'The connection didn’t go through', texto: 'Nothing answered: a NetworkPolicy dropping the request (see <code>kubectl get netpol -A</code>), a stuck program or an address that doesn’t exist.', vidaReal: 'The turnstile didn’t let them through and nobody said a thing: the visitor is left waiting at the door.' },
  { re: /Read-only file system/, titulo: 'The disk is read-only', texto: 'The container has <code>readOnlyRootFilesystem: true</code> (or the volume was mounted read-only). To write, mount a volume (an <code>emptyDir</code>) on the folder where the program writes.', vidaReal: 'The walls are sealed: work happens only at the desk (the volume).' },
  { re: /\bPending\b/, titulo: 'Pending: the pod doesn’t have a spot yet', texto: 'Either the scheduler didn’t find a node where it fits (see <code>kubectl describe pod NAME</code>, under Events: <i>FailedScheduling</i>), or it’s just getting started.', vidaReal: 'Waiting in the lobby: the realtor hasn’t found a building with room yet.' },
  { re: /\bErrImageNeverPull\b/, titulo: 'The image isn’t on the node, and the pod forbade pulling it', texto: 'With <code>imagePullPolicy: Never</code>, the kubelet only uses an image that’s already on the node (in kind, loaded with <code>kind load docker-image</code>). Drop the <code>Never</code> (the default <code>IfNotPresent</code> pulls when it’s missing) or put the image on the node.', vidaReal: 'The rule is “only furniture that’s already in the storage room”, and the couch never went to the storage room.' },
  { re: /existing pods in namespace "[^"]+" violate the new PodSecurity enforce level/, titulo: 'The new rule applies to the next pods', texto: 'The label was applied, but the pods already running don’t pass it. They keep running (the rule is only checked when a pod is created); the next identical pod, in a version rollout or a restart by the Deployment, will be rejected. Fix the <code>securityContext</code> before that happens.', vidaReal: 'The building’s new regulations don’t evict anyone who already lives there, but the next move-in has to follow the rules.' },
  { re: /^Warning: unknown field "[^"]+"/m, titulo: 'The field was ignored', texto: 'The patch had a field Kubernetes doesn’t know (a typo, like <code>replica</code> instead of <code>replicas</code>, or the path in the wrong place). It was thrown away, which is why the rest may say <code>patched (no change)</code>: nothing changed. Check the name with <code>kubectl explain</code>.', vidaReal: 'The form came back stamped, but the line with the made-up field was crossed out.' },
  { re: /^Warning: v1 Endpoints is deprecated/m, titulo: 'Warning: Endpoints is on its way out', texto: 'Not an error: the list came right below. Endpoints (the IPs of the ready pods behind a Service) was replaced by EndpointSlice, which keeps the same list in slices, and since v1.33 the API Server warns every time someone reads the old one. The same IPs, without the warning: <code>kubectl describe svc NAME</code> (the Endpoints line) or <code>kubectl get endpointslices -l kubernetes.io/service-name=NAME</code>.', vidaReal: 'The front desk swapped the visitor logbook for separate cards: the old logbook is still on the counter, with a note saying “use the cards”.' },
  { re: /is missing the kubectl\.kubernetes\.io\/last-applied-configuration annotation/, titulo: 'Warning: the object wasn’t born from an apply', texto: 'It was created with <code>kubectl create</code> (or <code>run</code>, <code>expose</code>), which doesn’t keep the last applied version. kubectl warns and records that memory in this same apply: from here on, stick with <code>apply</code>. Without it, this first apply can’t tell which fields you removed from the YAML (they stay).', vidaReal: 'The building went up without a blueprint: the architect drew one now, from what was already built.' },
];
