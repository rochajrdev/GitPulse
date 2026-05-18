# 📊 GitPulse

O **GitPulse** é uma plataforma open-source projetada para centralizar e unificar o histórico de contribuições de desenvolvedores que utilizam múltiplos serviços de Git em seu dia a dia.

Se você divide seus projetos entre diferentes provedores, suas métricas de contribuição acabam fragmentadas. O GitPulse resolve isso centralizando o recebimento de eventos via **Webhooks**, consolidando esses dados em um banco próprio e expondo uma API para gerar um mapa de calor (gráfico de contribuições) global e customizável para o seu site pessoal ou portfólio.

---

## 🚀 Como Funciona

```
[Múltiplos Provedores Git] ──► (Webhooks / Push Events)
                                       │
                                       ▼
                             [GitPulse API Backend]
                                       │ (Salva commits e re-calcula streaks)
                                       ▼
                             [SQLite / Prisma ORM]
                                       │
                                       ▼
                          [Dashboard Frontend React]
```

1. **Webhooks**: Você configura uma URL única de webhook no seu provedor (GitHub, GitLab, Bitbucket).
2. **Processamento**: Toda vez que você faz `git push`, a plataforma envia o evento para o GitPulse, que filtra os commits pelo seu e-mail de autor cadastrado e registra no banco.
3. **Consolidação**: A API consolida os dados, calcula a sequência atual (streak), recordes e médias diárias.
4. **Visualização**: Um dashboard em React exibe o mapa de calor unificado, gráficos de atividade e possui um simulador para disparar pushes de teste localmente.

---

## 🏗️ Estrutura do Repositório

O projeto está estruturado em um monorepo simples:

```text
gitpulse/
├── backend/               # API em Fastify, Prisma ORM e SQLite
│   ├── src/               # Código-fonte do backend
│   └── prisma/            # Schema do banco de dados e migrações
└── frontend/              # Dashboard interativo com React + Vite + TS
    ├── src/               # Componentes, telas e estilos
    └── public/            # Assets estáticos
```

---

## 🛠️ Tecnologias Utilizadas

### Backend
- **Node.js** (v24+) com **TypeScript**
- **Fastify**: Framework web de alta performance
- **Prisma ORM**: Modelagem de banco de dados tipada e robusta
- **SQLite**: Banco relacional em arquivo local, eliminando a necessidade de infraestrutura pesada externa
- **Zod**: Validação e parsing de esquemas de dados

### Frontend
- **React 18** com **Vite** e **TypeScript**
- **Vanilla CSS**: Estilos customizados sem dependências, com gradientes harmônicos, modo escuro puro e efeitos de glassmorphism e neon glow
- **Custom SVG**: Mapa de calor interativo e animado construído diretamente com componentes React para máxima leveza e customização

---

## ⚡ Guia de Inicialização Rápida

Consulte o README interno de cada pasta para informações de instalação e dependências específicas.

### 1. Iniciar o Backend
```bash
cd backend
npm install
npm run db:setup    # Executa migrations e popula o banco com dados de teste
npm run dev         # Inicia na porta 3000
```

### 2. Iniciar o Frontend
```bash
cd frontend
npm install
npm run dev         # Inicia na porta 3001
```

## 🌐 Arquitetura Self-Hosted & Visão Híbrida

O **GitPulse** foi projetado com uma **filosofia arquitetural híbrida** altamente flexível:

1. **Modelo Self-Hosted (Atual)**:
   - Roda 100% de forma privada na máquina de desenvolvimento local ou em uma VPS própria do desenvolvedor.
   - Utiliza **SQLite** como banco de dados local embarcado, garantindo total privacidade e eliminando qualquer custo ou dependência de infraestrutura externa complexa.
   - O desenvolvedor tem controle absoluto sobre seus e-mails associados, tokens e histórico de contribuições.

2. **Modelo Centralizado / Nuvem Híbrida (Visão Futura)**:
   - Toda a estrutura do backend e monorepo foi construída para atuar perfeitamente como um **edge collector** (agente coletor).
   - Em futuras atualizações, a instância local poderá sincronizar os dados consolidados de forma segura e criptografada com a plataforma em nuvem (**GitPulse Cloud**).
   - Isso permitirá que você tenha um link público global (ex: `gitpulse.dev/seu-usuario`) exibindo seus commits sem precisar expor seu servidor self-hosted local para a internet pública!

---

Sob a licença [MIT](./LICENSE). Desenvolvido com 💚 para enriquecer o portfólio de engenharia de software.
