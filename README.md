# Car Doce Car - Agendamentos

App de agendamentos da Car Doce Car em React (Vite) com **Firebase** (Firestore + Authentication).
Cada agendamento tem **cliente, carro, serviço, observações (opcional), data, horário e valor**; só é salvo com tudo preenchido (exceto observações).
Permite **adicionar**, **editar**, **excluir**, **favoritar**, **filtrar favoritos** e **marcar o serviço como realizado**, com os dados
**sincronizados em tempo real** entre celulares e computadores.

## 1. Configurar o Firebase (uma vez só)

1. Em https://console.firebase.google.com, crie um projeto.
2. Na página inicial do projeto, clique em **Web `</>`**, registre o app e copie o `firebaseConfig`.
3. **Criação > Firestore Database > Criar banco de dados** (região `southamerica-east1`, modo de produção).
4. **Criação > Authentication > Primeiros passos > E-mail/senha**: ativar.
5. Em Authentication > **Usuários > Adicionar usuário**: crie seu e-mail e senha (é o login do app).
6. Em Firestore > **Regras**: cole o conteúdo de `firestore.rules` e publique.

## 2. Configurar o projeto

Requisito: [Node.js](https://nodejs.org) 18 ou superior.

```bash
npm install
cp .env.example .env     # no Windows: copy .env.example .env
```

Abra o `.env` e preencha com os valores do `firebaseConfig`. Depois:

```bash
npm run dev
```

Abra http://localhost:5000 e entre com o e-mail e a senha criados no passo 1.5.

## 3. Publicar para usar no celular (Firebase Hosting)

```bash
npm install -g firebase-tools
firebase login
firebase use --add        # escolha o seu projeto
npm run build
firebase deploy
```

O Firebase mostra o link final (`https://SEU-PROJETO.web.app`). No iPhone, abra no Safari e use
**Compartilhar > Adicionar à Tela de Início**. Entre com o mesmo e-mail e senha em todos os aparelhos.

Se publicar em outro serviço (Netlify, Vercel...), cadastre as variáveis `VITE_FIREBASE_*` no painel dele
e adicione o domínio em Authentication > Configurações > **Domínios autorizados**.

## 4. Cargos e logins (Administrativo, Vendedor, Operacional)

| Ação | Administrativo | Vendedor | Operacional |
|---|:--:|:--:|:--:|
| Ver agendamentos/orçamentos | ✅ | ✅ | ✅ |
| Lançar novo | ✅ | ✅ | ❌ |
| Editar cliente, carro, serviço, obs., data e horário | ✅ | ✅ | ❌ |
| Informar o valor ao lançar | ✅ | ✅ | ❌ |
| Alterar o valor depois | ✅ | ❌ | ❌ |
| Excluir, marcar como realizado, favoritar | ✅ | ❌ | ❌ |
| Administrar os logins da unidade | ✅ | ❌ | ❌ |

As permissões ficam em `src/utils/permissions.js` (o que aparece na tela) e em `firestore.rules`
(o que o banco realmente aceita). Se mudar uma, mude a outra.

### Ativar (uma vez só)

1. Publique as regras: `firebase deploy --only firestore:rules` (ou cole `firestore.rules` em Firestore > Regras).
2. **Primeiro administrador** (você, que já tem login): entre no app. Vai aparecer "Acesso não configurado" com um código (UID).
   No Firebase: Firestore Database > **Iniciar coleção** `users` (ou abra a coleção `users`) > **Adicionar documento**,
   com **ID do documento = esse código** e os campos:
   - `name` (string): seu nome
   - `email` (string): seu e-mail
   - `role` (string): `admin`
   - `unitId` (string): **o mesmo código (UID)**
   - `active` (boolean): `true`

   Seus agendamentos atuais continuam onde estão e aparecem normalmente.
3. Recarregue o app: aparece o botão **Usuários**. Por ali o Administrativo cria logins (nome, e-mail, senha e cargo),
   troca o cargo, envia e-mail de redefinição de senha e desativa/reativa logins da própria unidade.

Observações:
- Desativar bloqueia o acesso na hora, mas a conta continua existindo no Authentication (o navegador não consegue apagar contas de outras pessoas).
- Para criar uma **nova unidade**, crie o login do administrador dela em Authentication e repita o passo 2 com o UID dele.

## 5. Avisos de novos agendamentos (notificação no celular/computador)

Quando alguém lança um agendamento, todos os logins **ativos** da mesma unidade (menos quem lançou) recebem uma notificação,
mesmo com o app fechado. Funciona assim: o botão **🔔 Avisos** registra o aparelho no Firebase Cloud Messaging; depois que o
agendamento é salvo, o app chama um **Worker gratuito da Cloudflare** (`worker/index.js`), que confere o login, descobre os
aparelhos da unidade e envia o aviso. Não precisa do plano Blaze do Firebase (o projeto continua no plano gratuito).

**O passo a passo completo está no tutorial separado (TUTORIAL-NOTIFICACOES).** Resumo:

1. Gere a **chave VAPID** (Firebase > Configurações do projeto > Cloud Messaging > Certificados push da Web) e cole em `VITE_FIREBASE_VAPID_KEY` no `.env`.
2. Gere a **chave da conta de serviço** (Firebase > Configurações do projeto > Contas de serviço > Gerar nova chave privada).
3. Publique o Worker (`cd worker`, `npx wrangler deploy`) e cadastre a chave como segredo `FIREBASE_SERVICE_ACCOUNT`.
4. Cole o endereço do Worker em `VITE_NOTIFY_URL` no `.env`, depois `npm run build` e `firebase deploy`.
5. Em cada aparelho: abra o site publicado, entre e toque em **🔔 Avisos** > Permitir.

### Importante

- Notificações só funcionam em **https** (o site publicado) ou em `localhost`; não funcionam abrindo pelo IP da rede (`http://26.x.x.x:5000`).
- **iPhone:** precisa ser iOS 16.4+, abrir o app pelo ícone da **Tela de Início** (Safari > Compartilhar > Adicionar à Tela de Início) e só então tocar em Avisos.
- Quem lança o agendamento **não** recebe o aviso. Para testar, use **dois logins diferentes** (crie o segundo em **Usuários**).
- Quem sai da conta (**Sair**) deixa de receber os avisos naquele aparelho; ao entrar de novo o registro volta sozinho.
- Usuário desativado pelo Administrativo deixa de receber avisos.
- As variáveis `VITE_*` só são lidas na hora do build: depois de mudar o `.env`, rode `npm run build` e `firebase deploy` de novo.

## Estrutura

- `src/firebase.js` – inicialização do Firebase (Auth + Firestore com cache offline).
- `src/utils/appointment.js` – validação dos campos obrigatórios e formatação de valor (R$).
- `src/services/appointments.js` – salvar, listar em tempo real, editar e excluir.
- `src/components/Login` – tela de login.
- `src/components/Appointments` – formulário, filtro e lista.
- `src/utils/permissions.js` – tabela de cargos e permissões.
- `src/services/users.js` – perfis e logins da unidade (criar, cargo, ativar/desativar).
- `src/components/UsersAdmin` – tela do Administrativo para gerenciar logins.
- `src/components/AccessScreen` – avisos de acesso não configurado/desativado.
- `src/components/AppointmentItem` – cartão de cada agendamento, com edição inline e exportação para agenda.
- `src/services/notifications.js` / `src/components/NotificationsToggle` / `public/firebase-messaging-sw.js` – registro do aparelho, pedido de aviso ao Worker e recebimento.
- `worker/index.js` / `worker/wrangler.toml` – Worker da Cloudflare que envia o aviso a cada novo agendamento.
- `firestore.rules` / `firebase.json` – regras de segurança e configuração de deploy.

## Se o `npm install` falhar

1. Confira `node -v` (precisa ser 18+).
2. Apague `node_modules` e `package-lock.json` e rode `npm install` de novo.
3. Limpe o cache: `npm cache clean --force`.
4. Em rede com proxy, configure o proxy do npm ou tente outra rede.