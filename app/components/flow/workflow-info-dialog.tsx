import { useEffect, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";

export type WorkflowInfo = {
  name: string;
  description: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  info: WorkflowInfo;
  onSave: (info: WorkflowInfo) => void;
};

/**
 * Dialog para visualizar e editar metadados do workflow (nome, descrição).
 * O estado local só é "compromissado" ao clicar Salvar — fechar sem salvar
 * descarta as edições, evitando alterações acidentais.
 */
export function WorkflowInfoDialog({ open, onOpenChange, info, onSave }: Props) {
  const [name, setName] = useState(info.name);
  const [description, setDescription] = useState(info.description);

  // Resyncroniza o form sempre que reabrir ou quando o workflow externo mudar.
  useEffect(() => {
    if (open) {
      setName(info.name);
      setDescription(info.description);
    }
  }, [open, info]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    onSave({ name: name.trim() || "Workflow sem título", description: description.trim() });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Informações do workflow</DialogTitle>
          <DialogDescription>
            Edite o nome e a descrição. As mudanças se aplicam ao salvar.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="wf-name">Nome</Label>
            <Input
              id="wf-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Onboarding de lead"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="wf-description">Descrição</Label>
            <Textarea
              id="wf-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="O que esse workflow faz?"
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit">Salvar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
