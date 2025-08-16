# Bot de Controle do Varal Inteligente

Este projeto permite controlar um varal inteligente remotamente através de um bot no Telegram. O bot se comunica com o sistema via MQTT para acionar o varal de forma automática ou manual.

## Requisitos

- **Conta no Telegram**
- **Node.js** instalado na sua máquina

## Como Rodar o Bot

1. **Baixe o Projeto:**
   - Faça o download ou clone o repositório para a sua máquina.

2. **Instale as Dependências:**
   - No diretório do projeto, execute `npm install` para instalar as dependências necessárias.

3. **Configure o Bot no Telegram:**
   - Crie um bot no Telegram através do BotFather e obtenha o **token** de autenticação.

4. **Configure o Ambiente:**
   - Insira o token do bot e as configurações do servidor MQTT no arquivo de configuração do projeto.

5. **Execute o Bot:**
   - No terminal, execute o bot com `node bot.js`. O bot estará pronto para uso no Telegram.

## Usando o Bot

Depois de executar o bot, envie mensagens diretamente ao bot no Telegram para controlar o varal. O bot permitirá ações como:
- Ativar o modo automático
- Controlar o varal manualmente (recolher ou liberar)

O bot vai responder com atualizações sobre o status do varal e confirmações dos comandos.

## Conclusão

Esse sistema permite que você automatize e controle o seu varal de forma simples e prática através do Telegram, com a possibilidade de integração com outros dispositivos IoT no futuro.
