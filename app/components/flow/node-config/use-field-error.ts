/**
 * Hook utilitário pros custom panels reportarem erros de validação por campo.
 *
 * O `NodeConfigDialog` passa `onError(name, msg | null)` pro painel: enquanto
 * houver qualquer `msg` não-nula registrada, o botão Salvar fica travado.
 *
 * Uso típico dentro de um painel:
 *
 *   useFieldError(onError, "wait", noneSet ? "Informe ms, seconds ou until." : null);
 *
 * Reporta o erro sempre que `msg` muda e limpa (`null`) ao desmontar — assim
 * fechar/trocar de nó nunca deixa um erro órfão travando o Salvar.
 */
import { useEffect } from "react";

export function useFieldError(
  onError: ((name: string, msg: string | null) => void) | undefined,
  name: string,
  msg: string | null,
): void {
  useEffect(() => {
    onError?.(name, msg);
    return () => onError?.(name, null);
  }, [onError, name, msg]);
}
