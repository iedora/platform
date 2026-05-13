# Infraestrutura — Self-hosting

> **TL;DR** — `make up` provisiona um servidor Ubuntu local idêntico ao de produção. Funciona igual em Linux, macOS e Windows-via-WSL. O mesmo Ansible playbook configura local e prod; o que muda é só o provider do OpenTofu.

## Arquitetura

```
┌─────────────────────────────────────────────────────┐
│  Layer 1 — Provisionamento (OpenTofu)               │
│  local   → Docker provider (container Ubuntu+SSH)   │
│  prod    → Hetzner provider (VPS real)              │
├─────────────────────────────────────────────────────┤
│  Layer 2 — Configuração (Ansible)                   │
│  Mesmo playbook nos dois ambientes.                 │
│  Instala Docker, configura UFW, faz hardening SSH.  │
├─────────────────────────────────────────────────────┤
│  Layer 3 — Deploy da app (Kamal — em breve)         │
│  Zero-downtime, rollback, secrets encriptados.      │
└─────────────────────────────────────────────────────┘
```

O contrato entre layers é simples: o **layer 1** entrega um servidor Ubuntu com SSH acessível; o **layer 2** aceita qualquer servidor Ubuntu com SSH e configura-o. O layer 1 pode trocar (Docker local ↔ Hetzner ↔ bare metal) sem que o layer 2 precise de mudar.

## Estrutura

```
infra/
  docker/
    Dockerfile.server         Ubuntu 24.04 + sshd + utilizador deploy
                              (usado só pelo ambiente local)
  tofu/
    .gitignore                ignora state, lock, tfvars com secrets
    environments/
      local/
        main.tf               provider Docker, image build, container, upload SSH key
        variables.tf          vm_name, deploy_user, ssh_port, memory_gb, …
        outputs.tf            server_host, server_port, ssh_command
        terraform.tfvars      valores locais
      prod/
        main.tf               provider Hetzner, server, ssh_key, cloud-init
        variables.tf          + hcloud_token, server_type, location
        outputs.tf
        terraform.tfvars.example   template (criar terraform.tfvars com o token)
  ansible/
    ansible.cfg               desliga host_key_checking, activa pipelining
    setup.yml                 playbook idempotente, container-aware
    group_vars/
      all.yml                 deploy_user, timezone, firewall_allowed_ports
    inventory/
      local.ini               aponta para localhost:2222
      prod.ini.example        template para o IP do VPS
```

## Pré-requisitos

Comum a todos os SOs: **Docker**, **OpenTofu**, **Ansible**, **make**, **OpenSSH client**.

A chave SSH (`~/.ssh/id_ed25519`) **não precisa de existir antes** — o `make up` gera-a automaticamente na primeira execução via o alvo `ssh-key`. Se já existir, é reutilizada.

### Linux

Tudo nativo via package manager. Exemplo Debian/Ubuntu:

```bash
sudo apt install -y make ansible
# Docker: https://docs.docker.com/engine/install/
# OpenTofu: https://opentofu.org/docs/intro/install/deb/
```

### macOS

[OrbStack](https://orbstack.dev/) para Docker (mais leve que Docker Desktop, nativo Apple Silicon). Resto via Homebrew:

```bash
brew install opentofu ansible make
brew install --cask orbstack
```

### Windows

Docker Desktop no Windows + WSL 2 com Ubuntu. As ferramentas (`tofu`, `ansible`, `make`) instalam-se **dentro do WSL Ubuntu**, não no Windows. Os comandos `make` correm **a partir do WSL**.

```powershell
# No Windows (PowerShell admin):
wsl --install -d Ubuntu
```

```bash
# Dentro do WSL Ubuntu:
sudo apt update && sudo apt install -y make ansible
# OpenTofu:
curl --proto '=https' --tlsv1.2 -fsSL https://get.opentofu.org/install-opentofu.sh | sudo bash -s -- --install-method deb
```

#### Porquê activar a "WSL Integration" no Docker Desktop?

O Docker Desktop no Windows corre o daemon Docker dentro da sua própria distro WSL (`docker-desktop`), isolada das outras. Quando corremos `make up` dentro do WSL Ubuntu, o OpenTofu e o Ansible precisam de falar com esse daemon — e por defeito a distro Ubuntu **não tem o comando `docker` nem acesso ao daemon**.

Activar **Docker Desktop → Settings → Resources → WSL Integration → toggle "Ubuntu" → Apply & Restart** injecta o `docker` CLI na PATH do Ubuntu e abre o canal de comunicação para o daemon. A partir daí, `docker ps` (e portanto o provider Docker do Tofu) funcionam dentro do WSL como se fosse Linux nativo. **Sem este passo, o `make up` falha imediatamente** porque o Tofu não consegue contactar o daemon.

## Comandos

```bash
make up        # provisiona servidor (ssh-key + Tofu apply + Ansible playbook)
make down      # destrói o servidor
make recreate  # destrói e recria do zero (~30s no local)
make tofu      # apenas Tofu apply (gera SSH key se necessário)
make ansible   # apenas Ansible playbook
make ssh-key   # gera ~/.ssh/id_ed25519 se não existir (idempotente)
make ssh       # SSH para o servidor local (deploy@localhost:2222)
make help      # lista alvos
```

Tudo idempotente — correr `make up` duas vezes seguidas não cria recursos duplicados, o Ansible só reaplica o que mudou, e a SSH key existente nunca é sobrescrita. Num clone fresh do repo, **`make up` é o único comando necessário** para ter o servidor a correr.

## Como funciona o ambiente local

1. **OpenTofu** com o provider `kreuzwerker/docker`:
   - Builda a imagem `meta-menu-server-base` a partir de `infra/docker/Dockerfile.server`. O Dockerfile cria o utilizador `deploy` (sudo NOPASSWD), instala sshd, e endurece o `sshd_config` (sem root login, sem password auth).
   - Levanta um container `meta-menu-server` privilegiado (precisa de privilégios para correr `dockerd` por dentro — Docker-in-Docker, exigido pelo Kamal).
   - Mapeia a porta 22 do container para `localhost:2222` no host.
   - O bloco `upload` do provider injecta `authorized_keys` directamente no container — **zero scripts de bootstrap, tudo declarativo**.

2. **Ansible** liga-se via SSH (`deploy@localhost:2222`) e configura:
   - Pacotes base (`curl`, `git`, `ufw`, `ca-certificates`)
   - Docker CE via repositório oficial
   - Adiciona `deploy` ao grupo `docker`
   - Regras UFW (22/80/443) — *só executa em servidores reais; em containers é skipped porque não há kernel netfilter*
   - Reinicia `sshd` após aplicar hardening

3. As tasks sensíveis a systemd (`systemd:` module) detectam `/.dockerenv` e usam alternativas em container (ex: `dockerd` em foreground em vez de `systemctl start docker`).

## Como funciona o ambiente prod (Hetzner)

1. **OpenTofu** com `hetznercloud/hcloud`:
   - Cria um `hcloud_ssh_key` com a chave pública local
   - Cria um `hcloud_server` (ex: `cx22` = 2 vCPU / 4GB RAM / ~€4/mês, Nuremberg)
   - Passa um `cloud-init` user-data que cria o utilizador `deploy` com a SSH key e regras UFW base

2. **Ansible** corre o mesmo `setup.yml` contra o IP do VPS — as tasks sistemas (`systemd`, `ufw`) executam normalmente em servidores reais.

Para usar:

```bash
cd infra/tofu/environments/prod
cp terraform.tfvars.example terraform.tfvars
# editar terraform.tfvars com o token da Hetzner (Console → API Tokens)
tofu init && tofu apply

# copiar inventory/prod.ini.example para prod.ini com o IP do output
ansible-playbook -i ../../ansible/inventory/prod.ini ../../ansible/setup.yml
```

## Adicionar um novo ambiente / provider

A interface é o contrato Tofu output `server_host` + `server_port`. Para adicionar AWS, DigitalOcean, bare metal, basta criar `infra/tofu/environments/<nome>/` com qualquer provider e expor os mesmos outputs. O Ansible nunca precisa de saber a fonte.

## Decisões de design importantes

- **Dois layers, contrato fino.** OpenTofu provisiona, Ansible configura. Trocar o provider de cima nunca obriga a mexer no de baixo.
- **Sem scripts proprietários** (shell, PowerShell). Tudo declarativo: Tofu HCL, Ansible YAML, Dockerfile, Makefile. O único "código imperativo" são os comandos `RUN` do Dockerfile, que servem para construir uma imagem reprodutível.
- **Local mirroreia prod com fidelidade prática.** Mesmo SO (Ubuntu 24.04), mesmo Ansible. As únicas diferenças são as inerentes ao container (sem systemd, sem UFW efectivo) — e essas estão isoladas com `when: not dockerenv.stat.exists`.
- **State do Tofu fica local** (não há backend remoto). Para colaboração / CI futuro, migrar para S3/HCP.

## Troubleshooting

**`make up` falha com "Cannot connect to the Docker daemon" no Windows.** Falta activar a WSL Integration para a distro Ubuntu (ver secção acima).

**Ansible falha com "Host key verification failed".** O container foi recriado e tem uma host key nova. O playbook já corre `ssh-keyscan` antes da primeira task; se persistir, apaga manualmente: `ssh-keygen -R '[localhost]:2222'`.

**Tofu queixa-se de "Required plugins are not installed" depois de mudar de SO.** A pasta `.terraform/` tem providers compilados para o SO original. Apagar e re-init:

```bash
cd infra/tofu/environments/local
rm -rf .terraform .terraform.lock.hcl
tofu init
```

**O container está a correr mas o SSH dá "Connection refused".** Esperar 2-3 segundos depois do `tofu apply` — o sshd demora um instante a abrir o socket. Em alternativa, o `make ansible` já espera implicitamente até a primeira conexão funcionar.
