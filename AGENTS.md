<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Workflow state changes (respuesta → transacción, confirmar, verificar) live in SECURITY DEFINER Postgres triggers/RPCs; the client only calls them — keeps rules enforced server-side.
- Admin role lives in user_roles (has_role); conductor/mecánico role lives in perfiles.rol and is set only by the signup trigger — prevents privilege escalation.
