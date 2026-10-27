// A gêmea de scripts/golden/70-rollout.sh no simulador (namespace rollout): três change-cause, o undo --to-revision=1
// (o change-cause da revisão 1 volta junto), o undo que não muda nada e o rollout pausado, que recusa o undo e o restart.
export default ({ k, cap }) => {
  const esperar = () => k('kubectl -n rollout rollout status deploy/loja --timeout=180s');
  k('kubectl create namespace rollout');
  k('kubectl apply -f /tmp/kl-rollout-loja.yaml');
  k("kubectl -n rollout annotate deployment loja kubernetes.io/change-cause='versao 1.0: abertura'");
  esperar();
  k('kubectl -n rollout set image deployment/loja nginx=nginx:1.28');
  k("kubectl -n rollout annotate deployment loja kubernetes.io/change-cause='versao 1.1: carrinho' --overwrite");
  esperar();
  k('kubectl -n rollout set env deployment/loja COR=azul');
  k("kubectl -n rollout annotate deployment loja kubernetes.io/change-cause='versao 2.0: reclamou' --overwrite");
  esperar();
  cap('rollout-hist-antes', 'kubectl -n rollout rollout history deploy/loja');
  cap('rollout-undo-rev1', 'kubectl -n rollout rollout undo deploy/loja --to-revision=1');
  esperar();
  cap('rollout-hist-depois', 'kubectl -n rollout rollout history deploy/loja');
  cap('rollout-hist-rev4', 'kubectl -n rollout rollout history deploy/loja --revision=4');
  cap('rollout-change-cause', "kubectl -n rollout get deploy loja -o jsonpath='{.metadata.annotations.kubernetes\\.io/change-cause}'");
  cap('rollout-undo-igual', 'kubectl -n rollout rollout undo deploy/loja --to-revision=4');
  cap('rollout-pause', 'kubectl -n rollout rollout pause deploy/loja');
  cap('rollout-undo-pausado', 'kubectl -n rollout rollout undo deploy/loja');
  cap('rollout-restart-pausado', 'kubectl -n rollout rollout restart deploy/loja');
  cap('rollout-resume', 'kubectl -n rollout rollout resume deploy/loja');
};
