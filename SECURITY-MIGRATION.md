# Migração de segurança do Painel RH

Esta mudança deve ser publicada em duas fases para não bloquear o sistema.

1. Autenticar a Firebase CLI na conta proprietária do projeto `sistema-presenca-99791`.
2. Ativar o provedor **E-mail/senha** no Firebase Authentication.
3. Criar `functions/migration-input.local.json` a partir do exemplo. Esse arquivo é ignorado pelo Git e deve conter as duas novas senhas com no mínimo 6 caracteres e a decisão sobre o cadastro duplicado de `bruna`.
4. Definir `GOOGLE_APPLICATION_CREDENTIALS` apontando para uma credencial administrativa mantida somente no computador local.
5. Em `functions`, executar `npm install`, `npm run migrate:preflight` e, quando o relatório estiver limpo, `npm run migrate:stage`.
6. Validar o login e as permissões de cada usuário antes de remover qualquer senha.
7. Abrir uma janela curta de manutenção e impedir o uso do sistema antigo.
8. Publicar Functions; executar `npm run migrate:finalize`; publicar as regras e a aplicação nova nessa ordem, ainda dentro da manutenção. A finalização exige confirmação explícita e remove os documentos legados que contêm senhas antes de reabrir o painel.

Nunca adicione `migration-input.local.json`, relatórios locais ou arquivos de conta de serviço ao GitHub.
