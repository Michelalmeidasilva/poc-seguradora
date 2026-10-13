# Atlas da experiência no WhatsApp

Protótipo HTML independente com **25 jornadas e 281 estados**, incluindo os **34 estados legados**. Abra `atlas-whatsapp.html` diretamente no navegador: é um arquivo único, sem instalação, rede ou backend. `index.html` é a versão de desenvolvimento, que usa os arquivos adjacentes. Para servir localmente: `python3 -m http.server 8765 --directory docs/prototypes/whatsapp-experience`.

## Autenticação obrigatória

Nenhuma jornada pessoal abre sem autenticação: contratação, contrato, dependentes, pagamentos, documentos, solicitações e uso de assistências vinculadas. A regra cobre links diretos, catálogo, galeria e referências legadas. Conteúdo informativo público e orientação inicial permanecem livres.

O CPF localiza o cadastro, mas não autentica sozinho. Use **529.982.247-25**, exclusivamente fictício, em `IDE-08`; depois confirme com o código demonstrativo **123456** em `IDE-02`. “Já tenho código” representa um cadastro previamente identificado. Navegar para a tela de sucesso não libera acesso. Após validar, o pedido original é retomado; a sessão demonstrativa dura 15 minutos e recarregar exige autenticação novamente.

Esta é uma simulação UX, não segurança real: dados e código estão no HTML. Em produção, validação, vínculo do código, envio por canal cadastrado, expiração, limite de tentativas e autorização de cada operação devem ser impostos no servidor. Nunca use dados reais aqui.

## Serviços fornecidos

As assistências fornecidas são exclusivamente:

- Telemedicina.
- Assistência Funeral: suporte ao titular e aos dependentes.
- Assistência Farmácia: descontos em redes credenciadas.

Seguro Celular, proteção de bens e jornadas de sinistro não fazem parte deste escopo. Contratação, dependentes, pagamentos, documentos e atendimento são jornadas de gestão das assistências, não serviços adicionais. Esta definição substitui as hipóteses anteriores de catálogo; documentos técnicos compartilhados e fontes históricas externas não foram alterados nesta revisão.

Em `DES-01`, “Conhecer produtos disponíveis” apresenta Assistência Funeral, Assistência Farmácia e Telemedicina com resumos. Cada item abre uma mensagem conversacional de detalhes (`DES-12` a `DES-14`) com quick replies “Ver opções” e “Voltar aos serviços”. O WhatsApp permite até três botões de resposta rápida por mensagem; os rótulos usados respeitam o limite de 20 caracteres. Os textos não presumem coberturas, valores, carências, redes específicas ou disponibilidade não confirmadas.

A tela `DEP-33` demonstra a jornada do slide: uma mensagem fornece nome, CPF, nascimento e parentesco de João da Silva. `DEP-34` pergunta explicitamente celular e sexo biológico, campos encontrados no legado; nunca infere sexo/gênero. A obrigatoriedade e as opções desses campos precisam de validação do produto. `DEP-06` reúne os dados para revisão.

As lacunas cobertas do legado incluem ainda a central de dúvidas (`FAQ-01` a `FAQ-05`), motivos opcionais de cancelamento (`CAN-13`), encerramento de conversa separado de cancelamento (`FIM-01` e `FIM-02`), card do titular após autenticação e CPF mascarado na seleção de exclusão. A coleta nativa de contato do WhatsApp não foi reproduzida; nascimento do titular permanece substituído pela autenticação aprovada com CPF + código.

## Navegação

`comparativo-legado.html` é o relatório independente de comparação entre o Figma e a experiência nova. Abra diretamente no navegador: possui 45 itens classificados como lacunas remanescentes, lacunas equalizadas, regras alteradas, jornadas novas, ampliações e hipóteses, com busca, filtro de origem, comparação lado a lado, impressão e links para as 34 telas originais. O relatório funciona offline; links externos exigem internet e os links do atlas dependem do arquivo adjacente.

- Catálogo lateral de jornadas; busca por título, conteúdo e identificador.
- Seleção de estados, filtros de percurso principal/variações e navegação anterior/próxima.
- Botões da conversa, listas e formulários levam a estados do protótipo.
- Correção de nome/data pela conversa; campos e arquivos de demonstração.
- Galeria de todas as telas e impressão do catálogo.
- Tema claro/escuro do WhatsApp, links por estado e documentos ilustrativos.
- Responsivo; controles por teclado, textos acessíveis e respeito a movimento reduzido.

## Limites do desenho

O catálogo registra as decisões da conversa e os estados previstos, além de reconstruir os 34 estados do documento legado. Não é uma reprodução pixel a pixel do Figma original nem uma integração com a Meta. Flows são aproximações visuais e precisam ser ajustados aos componentes e versões suportados pelo provedor real.

Todos os nomes, preços, datas, contratos e protocolos são fictícios. Não inserir dados pessoais reais. O exemplo familiar usa titular e até três dependentes somente para tornar a composição visual explícita; esse limite **não é uma regra validada**. Arquivos selecionados não são enviados, armazenados ou lidos; apenas o nome fica na memória da página. Recarregar apaga os dados demonstrativos.

Canal de envio do código, duração real de sessão, preços, carências, limites, data de cancelamento, restituição, meios de pagamento e acesso aos prestadores ainda precisam ser validados. `CAD` e `PRE` são propostas para lacunas, não decisões aprovadas. Atendimento a interessados também é hipótese.

Os estados são cenários independentes para revisão, com condições ilustrativas em cada tela. Navegação pelo catálogo pode saltar etapas de preenchimento para inspeção, mas nunca a autenticação. Texto livre usa regras demonstrativas e não um LLM; não calcula elegibilidade nem executa operações. Documentos são exemplos sem validade contratual. Não há chamadas de rede ou telemetria.

## Rastreabilidade

Fontes fornecidas pelo usuário:

- `/Users/user/workspace-personal/Seguradora/project/Chatbot/Chatbot.md`
- `/Users/user/workspace-personal/Seguradora/project/Chatbot/images/template_137.png`
- `/Users/user/workspace-personal/Seguradora/project/Plataforma/Plataforma.md`
- `/Users/user/workspace-personal/Seguradora/project/Apresentações/Corretor Conversacional.md`
- `/Users/user/workspace-personal/Seguradora/project/Reuniões/06-10-2026.md`
- Decisões iterativas de UX registradas na conversa.

`catalog.js` contém conteúdo, decisões, condições e destinos. `app.js` renderiza os estados e interações. `styles.css` concentra o desenho responsivo. Os IDs permitem rastrear as telas na futura organização do Figma.

Depois de alterar os arquivos-fonte, rode `node docs/prototypes/whatsapp-experience/export.mjs` para atualizar a versão em arquivo único. `preview-desktop.png` e `preview-mobile.png` mostram duas vistas inspecionadas.

## Verificação

`node docs/prototypes/whatsapp-experience/verify.mjs` verifica IDs, destinos, estrutura de componentes e os 34 estados legados. A interface também deve ser inspecionada no navegador para verificar renderização, formulários e responsividade.
