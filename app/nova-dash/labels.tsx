/* eslint-disable @typescript-eslint/no-explicit-any */
import { getLabels } from "../_actions/get-labels";

export default async function Labels() {
  const labels = await getLabels();

  return (
    <div className="p-4">
      <div className="flex flex-col gap-2 max-w-sm">
        <label htmlFor="label-select" className="font-medium">
          Selecione uma etiqueta
        </label>

        <select
          id="label-select"
          className="border rounded-md p-2"
          defaultValue=""
        >
          <option value="" disabled>
            Escolha uma etiqueta
          </option>

          {labels.map((label: any) => (
            <option key={label.id} value={label.id}>
              {label.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}