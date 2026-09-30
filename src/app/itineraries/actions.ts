"use server";

import { revalidatePath } from "next/cache";
import { executeGraphQL } from "@/lib/graphql/execute";

const updateItineraryStatusMutation = /* GraphQL */ `
  mutation UpdateItineraryStatus($id: ID!, $status: ItineraryStatus!) {
    updateItineraryStatus(id: $id, status: $status) {
      id
      status
    }
  }
`;

async function updateItineraryStatus(
  formData: FormData,
  status: "active" | "archived" | "trashed",
) {
  const id = String(formData.get("id") ?? "");

  await executeGraphQL(updateItineraryStatusMutation, { id, status });
  revalidatePath("/itineraries");
}

export async function restoreItinerary(formData: FormData) {
  await updateItineraryStatus(formData, "active");
}

export async function archiveItinerary(formData: FormData) {
  await updateItineraryStatus(formData, "archived");
}

export async function deleteItinerary(formData: FormData) {
  await updateItineraryStatus(formData, "trashed");
}

const deleteItineraryPermanentlyMutation = /* GraphQL */ `
  mutation DeleteItinerary($id: ID!) {
    deleteItinerary(id: $id)
  }
`;

export async function permanentlyDeleteItinerary(formData: FormData) {
  const id = String(formData.get("id") ?? "");

  await executeGraphQL(deleteItineraryPermanentlyMutation, { id });
  revalidatePath("/itineraries");
}

const renameItineraryMutation = /* GraphQL */ `
  mutation RenameItinerary($id: ID!, $name: String!) {
    renameItinerary(id: $id, name: $name) {
      id
      name
    }
  }
`;

export async function renameItinerary(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();

  await executeGraphQL(renameItineraryMutation, { id, name });
  revalidatePath("/itineraries");
}
