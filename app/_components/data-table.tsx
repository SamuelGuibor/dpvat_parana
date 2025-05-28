/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import * as React from "react";
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { FaSearch } from "react-icons/fa";
import { GripVerticalIcon, MoreVerticalIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { z } from "zod";
import { Badge } from "@/app/_components/ui/badge";
import { Button } from "@/app/_components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/app/_components/ui/dropdown-menu";
import { Input } from "@/app/_components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/_components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/_components/ui/table";
import { useState, useEffect } from "react";
import DialogDash from "./dialog";
import { differenceInDays, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export const schema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  status: z.string().optional(),
  statusStartedAt: z.string().optional().nullable(),
});

type DataType = z.infer<typeof schema>;

function DragHandle({ id }: { id: string }) {
  const { attributes, listeners } = useSortable({ id });

  return (
    <Button
      {...attributes}
      {...listeners}
      variant="ghost"
      size="icon"
      className="size-7 text-muted-foreground hover:bg-transparent"
    >
      <GripVerticalIcon className="size-3 text-muted-foreground" />
      <span className="sr-only">Drag to reorder</span>
    </Button>
  );
}

const columns: ColumnDef<DataType>[] = [
  {
    id: "drag",
    header: () => null,
    cell: ({ row }) => <DragHandle id={row.original.id} />,
  },
  {
    accessorKey: "name",
    header: "Nome",
    cell: ({ row }) => (
      <DialogDash
        userId={row.original.id}
        trigger={<span className="cursor-pointer hover:underline">{row.original.name}</span>}
      />
    ),
    enableHiding: false,
  },
  {
    accessorKey: "type",
    header: "Serviço",
    cell: ({ row }) => {
      const type = row.original.type;
      const badgeColor =
        type === "Aplicar Filtro DPVAT"
          ? "bg-green-100 text-green-800 border-green-300"
          : type === "Gerar Procuração Automática"
            ? "bg-green-100 text-green-800 border-green-300"
            : type === "Coletar Assinatura em Cartório"
              ? "bg-cyan-200 text-cyan-800 border-cyan-300"
              : type === "Coletar Assinatura Digital"
                ? "bg-cyan-200 text-cyan-800 border-cyan-300"
                : type === "Agendar Coleta com Motoboy"
                  ? "bg-blue-200 text-blue-800 border-blue-300"
                  : type === "Acompanhar Rota do Motoboy"
                    ? "bg-blue-200 text-blue-800 border-blue-300"
                    : type === "Fazer Protocolo no Hospital"
                      ? "bg-lime-200 text-lime-800 border-lime-300"
                      : type === "Protocolar Pasta – Hospital Presencial"
                        ? "bg-lime-200 text-lime-800 border-lime-300"
                        : type === "Solicitar Prontuário por E-mail"
                          ? "bg-yellow-200 text-yellow-800 border-yellow-300"
                          : type === "Solicitar Prontuário Cajuru por E-mail"
                            ? "bg-yellow-200 text-yellow-800 border-yellow-300"
                            : type === "Acompanhar Cajuru – Solicitado"
                              ? "bg-yellow-200 text-yellow-800 border-yellow-300"
                              : type === "Solicitar Prontuário – Outros Hospitais"
                                ? "bg-yellow-200 text-yellow-800 border-yellow-300"
                                : type === "Acompanhar Prontuário – Outros Solicitados"
                                  ? "bg-yellow-200 text-yellow-800 border-yellow-300"
                                  : type === "Solicitar Prontuário – Ponta Grossa"
                                    ? "bg-yellow-200 text-yellow-800 border-yellow-300"
                                    : type === "Aguardar Prontuário – Recebimento Online"
                                      ? "bg-amber-200 text-amber-800 border-amber-300"
                                      : type === "Aguardar Prontuário PG – Recebimento Online"
                                        ? "bg-amber-200 text-amber-800 border-amber-300"
                                        : type === "Aguardar Prontuário PG – Presencial"
                                          ? "bg-amber-200 text-amber-800 border-amber-300"
                                          : type === "Aguardar Retirada de Prontuário – Presencial"
                                            ? "bg-amber-200 text-amber-800 border-amber-300"
                                            : type === "Retirar Prontuário – Pronto para Retirar"
                                              ? "bg-amber-200 text-amber-800 border-amber-300"
                                              : type === "Resolver Problema com B.O."
                                                ? "bg-rose-200 text-rose-800 border-rose-300"
                                                : type === "Fazer B.O. – Equipe Rubi"
                                                  ? "bg-rose-200 text-rose-800 border-rose-300"
                                                  : type === "Orientar Cliente – Fazer B.O."
                                                    ? "bg-rose-200 text-rose-800 border-rose-300"
                                                    : type === "Enviar 1ª Mensagem – B.O."
                                                      ? "bg-rose-200 text-rose-800 border-rose-300"
                                                      : type === "Solicitar B.O. ao Cliente – Acidente"
                                                        ? "bg-rose-200 text-rose-800 border-rose-300"
                                                        : type === "Solicitar Siate"
                                                          ? "bg-red-200 text-red-800 border-red-300"
                                                          : type === "Aguardar Retorno do Siate"
                                                            ? "bg-red-200 text-red-800 border-red-300"
                                                            : type === "Acompanhar Siate – Pronto"
                                                              ? "bg-red-200 text-red-800 border-red-300"
                                                              : type === "Enviar Mensagem – Previdenciário"
                                                                ? "bg-rose-200 text-rose-800 border-rose-300"
                                                                : type === "Registrar Óbito – Nova Lei"
                                                                  ? "bg-rose-200 text-rose-800 border-rose-300"
                                                                  : type === "Protocolar SPVAT"
                                                                    ? "bg-indigo-200 text-indigo-800 border-indigo-300"
                                                                    : type === "Protocolar DPVAT – Caixa"
                                                                      ? "bg-indigo-200 text-indigo-800 border-indigo-300"
                                                                      : type === "Enviar para Reanálise"
                                                                        ? "bg-indigo-200 text-indigo-800 border-indigo-300"
                                                                        : type === "Manter SPVAT em Standby"
                                                                          ? "bg-indigo-200 text-indigo-800 border-indigo-300"
                                                                          : type === "Aguardar Análise da Caixa"
                                                                            ? "bg-blue-300 text-blue-800 border-blue-400"
                                                                            : type === "Acompanhar Pendências – Protocolado"
                                                                              ? "bg-fuchsia-200 text-fuchsia-800 border-fuchsia-300"
                                                                              : type === "Protocolar Pendência de B.O."
                                                                                ? "bg-fuchsia-200 text-fuchsia-800 border-fuchsia-300"
                                                                                : type === "Avisar Sobre Perícia Administrativa"
                                                                                  ? "bg-teal-200 text-teal-800 border-teal-300"
                                                                                  : type === "Aguardar Resultado da Perícia"
                                                                                    ? "bg-teal-200 text-teal-800 border-teal-300"
                                                                                    : type === "Cobrar Honorários – Resultado Perícia"
                                                                                      ? "bg-teal-200 text-teal-800 border-teal-300"
                                                                                      : type === "Aguardar Pagamento – Honorários Cobrados"
                                                                                        ? "bg-teal-200 text-teal-800 border-teal-300"
                                                                                        : type === "Encerrar Processo – DPVAT"
                                                                                          ? "bg-neutral-300 text-neutral-800 border-neutral-400"
                                                                                          : "bg-neutral-100 text-neutral-800 border-neutral-300";
      return (
        <div className="w-72">
          <Badge variant="outline" className={`px-1.5 ${badgeColor}`}>
            {type}
          </Badge>
        </div>
      );
    },
  },
  {
    accessorKey: "Timer",
    header: "Tempo",
    cell: ({ row }) => {
      const user = row.original;
      const roleTimeLimits: { [key: string]: number | null } = {
        "Aplicar Filtro DPVAT": 7,
        "Gerar Procuração Automática": 3,
        "Coletar Assinatura em Cartório": 5,
        "Coletar Assinatura Digital": 3,
        "Agendar Coleta com Motoboy": 2,
        "Acompanhar Rota do Motoboy": 2,
        "Fazer Protocolo no Hospital": 5,
        "Protocolar Pasta – Hospital Presencial": 5,
        "Solicitar Prontuário por E-mail": 7,
        "Solicitar Prontuário Cajuru por E-mail": 7,
        "Acompanhar Cajuru – Solicitado": 10,
        "Solicitar Prontuário – Outros Hospitais": 7,
        "Acompanhar Prontuário – Outros Solicitados": 10,
        "Solicitar Prontuário – Ponta Grossa": 7,
        "Aguardar Prontuário – Recebimento Online": 15,
        "Aguardar Prontuário PG – Recebimento Online": 15,
        "Aguardar Prontuário PG – Presencial": 15,
        "Aguardar Retirada de Prontuário – Presencial": 10,
        "Retirar Prontuário – Pronto para Retirar": 5,
        "Resolver Problema com B.O.": 7,
        "Fazer B.O. – Equipe Rubi": 5,
        "Orientar Cliente – Fazer B.O.": 3,
        "Enviar 1ª Mensagem – B.O.": 2,
        "Solicitar B.O. ao Cliente – Acidente": 5,
        "Solicitar Siate": 3,
        "Aguardar Retorno do Siate": 7,
        "Acompanhar Siate – Pronto": 5,
        "Enviar Mensagem – Previdenciário": 3,
        "Registrar Óbito – Nova Lei": 5,
        "Protocolar SPVAT": 7,
        "Protocolar DPVAT – Caixa": 7,
        "Enviar para Reanálise": 5,
        "Manter SPVAT em Standby": null,
        "Aguardar Análise da Caixa": 15,
        "Acompanhar Pendências – Protocolado": 10,
        "Protocolar Pendência de B.O.": 5,
        "Avisar Sobre Perícia Administrativa": 3,
        "Aguardar Resultado da Perícia": 15,
        "Cobrar Honorários – Resultado Perícia": 5,
        "Aguardar Pagamento – Honorários Cobrados": 7,
        "Encerrar Processo – DPVAT": null,
        "USER": null,
        "ADMIN": null,
      };

      if (!user.type || !user.statusStartedAt) {
        return <div>Sem data de início</div>;
      }

      const statusStartedAt = new Date(user.statusStartedAt);
      if (isNaN(statusStartedAt.getTime())) {
        console.error("Data inválida para statusStartedAt:", user.statusStartedAt);
        return <div>Data inválida</div>;
      }

      const daysInRole = differenceInDays(new Date(), statusStartedAt);

      const timeLimit = roleTimeLimits[user.type] ?? null;
      const isOverdue = timeLimit !== null && daysInRole > timeLimit;

      return (
        <div className={isOverdue ? "text-red-600 font-semibold" : "text-blue-700 font-semibold"}>
          {formatDistanceToNow(statusStartedAt, {
            locale: ptBR,
            addSuffix: true,
          })}
          {isOverdue && (
            <span className="ml-1 text-xs font-semibold">
            (Excedeu {daysInRole - timeLimit} dias)
            </span>
          )}
        </div>
      );
    },
    enableHiding: false,
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => (
      <Badge
        variant="outline"
        className="flex gap-1 px-1.5 text-muted-foreground [&_svg]:size-3"
      >
        {row.original.status || "Sem status"}
      </Badge>
    ),
  },
  {
    id: "actions",
    cell: () => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="flex size-8 text-muted-foreground data-[state=open]:bg-muted"
            size="icon"
          >
            <MoreVerticalIcon />
            <span className="sr-only">Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-32">
          <DropdownMenuItem>Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
];

function DraggableRow({ row }: { row: { original: DataType; getVisibleCells: () => any[]; id: string } }) {
  const { transform, transition, setNodeRef, isDragging } = useSortable({
    id: row.original.id,
  });

  return (
    <TableRow
      data-dragging={isDragging}
      ref={setNodeRef}
      className="relative z-0 data-[dragging=true]:z-10 data-[dragging=true]:opacity-80"
      style={{
        transform: CSS.Transform.toString(transform),
        transition: transition,
      }}
    >
      {row.getVisibleCells().map((cell) => (
        <TableCell key={cell.id}>
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </TableCell>
      ))}
    </TableRow>
  );
}

export function DataTable({ data }: { data: DataType[] }) {
  const [tableData, setTableData] = useState<DataType[]>(data);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: 10,
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [serviceFilter, setServiceFilter] = useState<string>("");

  useEffect(() => {
    setTableData(data);
  }, [data]);

  const sortableId = React.useId();
  const sensors = useSensors(
    useSensor(MouseSensor, {}),
    useSensor(TouchSensor, {}),
    useSensor(KeyboardSensor, {})
  );

  const dataIds = React.useMemo<UniqueIdentifier[]>(
    () => tableData?.map(({ id }) => id) || [],
    [tableData]
  );

  const table = useReactTable({
    data: tableData,
    columns,
    state: {
      sorting,
      columnVisibility,
      columnFilters,
      pagination,
    },
    getRowId: (row: DataType) => row.id,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  });

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (active && over && active.id !== over.id) {
      setTableData((data: DataType[]) => {
        const oldIndex = dataIds.indexOf(active.id);
        const newIndex = dataIds.indexOf(over.id);
        return arrayMove(data, oldIndex, newIndex);
      });
    }
  }

  useEffect(() => {
    const filters: ColumnFiltersState = [
      {
        id: "name",
        value: searchQuery,
      },
    ];

    if (serviceFilter !== "Todos") {
      filters.push({
        id: "type",
        value: serviceFilter === "Prontuario" ? "SOLICITAR PRONTUARIO" : serviceFilter,
      });
    }

    setColumnFilters(filters);
  }, [searchQuery, serviceFilter]);

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.target.value);
  };

  return (
    <div className="flex w-full flex-col justify-start gap-6">
      <div className="flex items-center justify-between px-4 lg:px-6">
        <div className="relative flex items-center">
          <FaSearch className="absolute left-2 text-black/70" />
          <Input
            value={searchQuery}
            onChange={handleSearchChange}
            type="text"
            placeholder="Pesquise um nome"
            className="pl-8 w-full"
          />
        </div>
        <div>
          <Select value={serviceFilter} onValueChange={setServiceFilter}>
            <SelectTrigger className="w-[360px]">
              <SelectValue placeholder="Filtrar por serviço" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem className="hover:bg-gray-200" value="Todos">Todos</SelectItem>
              <SelectItem className="hover:bg-gray-200" value="Aplicar Filtro DPVAT">Aplicar Filtro DPVAT</SelectItem>
              <SelectItem className="hover:bg-gray-200" value="Gerar Procuração Automática">Gerar Procuração Automática</SelectItem>
              <SelectItem className="hover:bg-gray-200" value="Coletar Assinatura em Cartório">Coletar Assinatura em Cartório</SelectItem>
              <SelectItem className="hover:bg-gray-200" value="Coletar Assinatura Digital">Coletar Assinatura Digital</SelectItem>
              <SelectItem className="hover:bg-gray-200" value="Agendar Coleta com Motoboy">Agendar Coleta com Motoboy</SelectItem>
              <SelectItem className="hover:bg-gray-200" value="Acompanhar Rota do Motoboy">Acompanhar Rota do Motoboy</SelectItem>
              <SelectItem className="hover:bg-gray-200" value="Fazer Protocolo no Hospital">Fazer Protocolo no Hospital</SelectItem>
              <SelectItem className="hover:bg-gray-200" value="Protocolar Pasta – Hospital Presencial">Protocolar Pasta – Hospital Presencial</SelectItem>
              <SelectItem className="hover:bg-gray-200" value="Solicitar Prontuário por E-mail">Solicitar Prontuário por E-mail</SelectItem>
              <SelectItem className="hover:bg-gray-200" value="Solicitar Prontuário Cajuru por E-mail">Solicitar Prontuário Cajuru por E-mail</SelectItem>
              <SelectItem className="hover:bg-gray-200" value="Acompanhar Cajuru – Solicitado">Acompanhar Cajuru – Solicitado</SelectItem>
              <SelectItem className="hover:bg-gray-200" value="Solicitar Prontuário – Outros Hospitais">Solicitar Prontuário – Outros Hospitais</SelectItem>
              <SelectItem className="hover:bg-gray-200" value="Acompanhar Prontuário – Outros Solicitados">Acompanhar Prontuário – Outros Solicitados</SelectItem>
              <SelectItem className="hover:bg-gray-200" value="Solicitar Prontuário – Ponta Grossa">Solicitar Prontuário – Ponta Grossa</SelectItem>
              <SelectItem className="hover:bg-gray-200" value="Aguardar Prontuário – Recebimento Online">Aguardar Prontuário – Recebimento Online</SelectItem>
              <SelectItem className="hover:bg-gray-200" value="Aguardar Prontuário PG – Recebimento Online">Aguardar Prontuário PG – Recebimento Online</SelectItem>
              <SelectItem className="hover:bg-gray-200" value="Aguardar Prontuário PG – Presencial">Aguardar Prontuário PG – Presencial</SelectItem>
              <SelectItem className="hover:bg-gray-200" value="Aguardar Retirada de Prontuário – Presencial">Aguardar Retirada de Prontuário – Presencial</SelectItem>
              <SelectItem className="hover:bg-gray-200" value="Retirar Prontuário – Pronto para Retirar">Retirar Prontuário – Pronto para Retirar</SelectItem>
              <SelectItem className="hover:bg-gray-200" value="Resolver Problema com B.O.">Resolver Problema com B.O.</SelectItem>
              <SelectItem className="hover:bg-gray-200" value="Fazer B.O. – Equipe Rubi">Fazer B.O. – Equipe Rubi</SelectItem>
              <SelectItem className="hover:bg-gray-200" value="Orientar Cliente – Fazer B.O.">Orientar Cliente – Fazer B.O.</SelectItem>
              <SelectItem className="hover:bg-gray-200" value="Enviar 1ª Mensagem – B.O.">Enviar 1ª Mensagem – B.O.</SelectItem>
              <SelectItem className="hover:bg-gray-200" value="Solicitar B.O. ao Cliente – Acidente">Solicitar B.O. ao Cliente – Acidente</SelectItem>
              <SelectItem className="hover:bg-gray-200" value="Solicitar Siate">Solicitar Siate</SelectItem>
              <SelectItem className="hover:bg-gray-200" value="Aguardar Retorno do Siate">Aguardar Retorno do Siate</SelectItem>
              <SelectItem className="hover:bg-gray-200" value="Acompanhar Siate – Pronto">Acompanhar Siate – Pronto</SelectItem>
              <SelectItem className="hover:bg-gray-200" value="Enviar Mensagem – Previdenciário">Enviar Mensagem – Previdenciário</SelectItem>
              <SelectItem className="hover:bg-gray-200" value="Registrar Óbito – Nova Lei">Registrar Óbito – Nova Lei</SelectItem>
              <SelectItem className="hover:bg-gray-200" value="Protocolar SPVAT">Protocolar SPVAT</SelectItem>
              <SelectItem className="hover:bg-gray-200" value="Protocolar DPVAT – Caixa">Protocolar DPVAT – Caixa</SelectItem>
              <SelectItem className="hover:bg-gray-200" value="Enviar para Reanálise">Enviar para Reanálise</SelectItem>
              <SelectItem className="hover:bg-gray-200" value="Manter SPVAT em Standby">Manter SPVAT em Standby</SelectItem>
              <SelectItem className="hover:bg-gray-200" value="Aguardar Análise da Caixa">Aguardar Análise da Caixa</SelectItem>
              <SelectItem className="hover:bg-gray-200" value="Acompanhar Pendências – Protocolado">Acompanhar Pendências – Protocolado</SelectItem>
              <SelectItem className="hover:bg-gray-200" value="Protocolar Pendência de B.O.">Protocolar Pendência de B.O.</SelectItem>
              <SelectItem className="hover:bg-gray-200" value="Avisar Sobre Perícia Administrativa">Avisar Sobre Perícia Administrativa</SelectItem>
              <SelectItem className="hover:bg-gray-200" value="Aguardar Resultado da Perícia">Aguardar Resultado da Perícia</SelectItem>
              <SelectItem className="hover:bg-gray-200" value="Cobrar Honorários – Resultado Perícia">Cobrar Honorários – Resultado Perícia</SelectItem>
              <SelectItem className="hover:bg-gray-200" value="Aguardar Pagamento – Honorários Cobrados">Aguardar Pagamento – Honorários Cobrados</SelectItem>
              <SelectItem className="hover:bg-gray-200" value="Encerrar Processo – DPVAT">Encerrar Processo – DPVAT</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="relative flex flex-col gap-4 overflow-auto px-4 lg:px-6">
        <div className="overflow-hidden rounded-lg border">
          <DndContext
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis]}
            onDragEnd={handleDragEnd}
            sensors={sensors}
            id={sortableId}
          >
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-muted">
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TableHead key={header.id} colSpan={header.colSpan}>
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows?.length ? (
                  <SortableContext items={dataIds} strategy={verticalListSortingStrategy}>
                    {table.getRowModel().rows.map((row) => (
                      <DraggableRow key={row.id} row={row} />
                    ))}
                  </SortableContext>
                ) : (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="h-24 text-center">
                      No results.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </DndContext>
        </div>
        <div className="flex items-center justify-between px-4">
          <div className="flex w-full items-center gap-8 lg:w-fit">
            <div className="hidden items-center gap-2 lg:flex">
              <Select
                value={`${table.getState().pagination.pageSize}`}
                onValueChange={(value) => {
                  table.setPageSize(Number(value));
                }}
              >
                <SelectTrigger className="w-20">
                  <SelectValue placeholder={table.getState().pagination.pageSize} />
                </SelectTrigger>
                <SelectContent side="top">
                  {[10, 20, 30, 40, 50].map((pageSize) => (
                    <SelectItem key={pageSize} value={`${pageSize}`}>
                      {pageSize}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex w-fit items-center justify-center text-sm font-medium">
              Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
            </div>
            <div className="ml-auto flex items-center gap-2 lg:ml-0">
              <Button
                variant="outline"
                className="size-8"
                size="icon"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
              >
                <span className="sr-only">Go to previous page</span>
                <ChevronLeftIcon />
              </Button>
              <Button
                variant="outline"
                className="size-8"
                size="icon"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
              >
                <span className="sr-only">Go to next page</span>
                <ChevronRightIcon />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}