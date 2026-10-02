"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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

const createItineraryMutation = /* GraphQL */ `
  mutation CreateItinerary(
    $name: String!
    $destination: String!
    $dateStart: String!
    $dateEnd: String!
  ) {
    createItinerary(
      name: $name
      destination: $destination
      dateStart: $dateStart
      dateEnd: $dateEnd
    ) {
      id
    }
  }
`;

const saveItineraryScheduleMutation = /* GraphQL */ `
  mutation SaveItinerarySchedule(
    $id: ID!
    $dayStart: String!
    $dayEnd: String!
    $timeInterval: Int!
  ) {
    saveItinerarySchedule(
      id: $id
      dayStart: $dayStart
      dayEnd: $dayEnd
      timeInterval: $timeInterval
    ) {
      id
      scheduleConfigured
    }
  }
`;

export async function saveItinerarySchedule(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const dayStart = String(formData.get("dayStart") ?? "");
  const dayEnd = String(formData.get("dayEnd") ?? "");
  const timeInterval = Number(formData.get("timeInterval"));

  await executeGraphQL(saveItineraryScheduleMutation, {
    id,
    dayStart,
    dayEnd,
    timeInterval,
  });
  revalidatePath(`/itineraries/${id}`);
}

const saveItineraryDayHeadingMutation = /* GraphQL */ `
  mutation SaveItineraryDayHeading($id: ID!, $date: String!, $heading: String!) {
    saveItineraryDayHeading(id: $id, date: $date, heading: $heading)
  }
`;

export async function saveItineraryDayHeading(
  itineraryId: string,
  date: string,
  heading: string,
) {
  await executeGraphQL(saveItineraryDayHeadingMutation, {
    id: itineraryId,
    date,
    heading,
  });
  revalidatePath(`/itineraries/${itineraryId}`);
}

export async function createItinerary(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const destination = String(formData.get("destination") ?? "").trim();
  const dateStart = String(formData.get("dateStart") ?? "");
  const dateEnd = String(formData.get("dateEnd") ?? "");

  await executeGraphQL(createItineraryMutation, {
    name,
    destination,
    dateStart,
    dateEnd,
  });
  revalidatePath("/itineraries");
  redirect("/itineraries");
}
