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
    $dateStart: String!
    $dateEnd: String!
  ) {
    createItinerary(
      name: $name
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
    $planningMode: PlanningMode!
    $dayStart: String
    $dayEnd: String
    $timeInterval: Int
    $places: [String!]!
    $sections: [String!]
  ) {
    saveItinerarySchedule(
      id: $id
      planningMode: $planningMode
      dayStart: $dayStart
      dayEnd: $dayEnd
      timeInterval: $timeInterval
      places: $places
      sections: $sections
    ) {
      id
      scheduleConfigured
      planningMode
    }
  }
`;

export async function saveItinerarySchedule(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const planningMode = formData.get("planningMode") === "sections" ? "sections" : "timeline";
  const dayStart = String(formData.get("dayStart") ?? "");
  const dayEnd = String(formData.get("dayEnd") ?? "");
  const timeInterval = Number(formData.get("timeInterval"));
  const places = [
    ...formData.getAll("places").map((value) => String(value)),
    String(formData.get("placeDraft") ?? ""),
  ];
  const sections = formData.getAll("sections").map((value) => String(value));

  await executeGraphQL(saveItineraryScheduleMutation, {
    id,
    planningMode,
    dayStart: planningMode === "timeline" ? dayStart : null,
    dayEnd: planningMode === "timeline" ? dayEnd : null,
    timeInterval: planningMode === "timeline" ? timeInterval : null,
    places,
    sections: planningMode === "sections" ? sections : [],
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

const updateItineraryMutation = /* GraphQL */ `
  mutation UpdateItinerary(
    $id: ID!
    $name: String!
    $dateStart: String!
    $dateEnd: String!
    $dayStart: String!
    $dayEnd: String!
    $timeInterval: Int!
  ) {
    updateItinerary(
      id: $id
      name: $name
      dateStart: $dateStart
      dateEnd: $dateEnd
      dayStart: $dayStart
      dayEnd: $dayEnd
      timeInterval: $timeInterval
    ) {
      id
      name
    }
  }
`;

export async function updateItinerary(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const dateStart = String(formData.get("dateStart") ?? "");
  const dateEnd = String(formData.get("dateEnd") ?? "");
  const dayStart = String(formData.get("dayStart") ?? "");
  const dayEnd = String(formData.get("dayEnd") ?? "");
  const timeInterval = Number(formData.get("timeInterval"));

  await executeGraphQL(updateItineraryMutation, {
    id,
    name,
    dateStart,
    dateEnd,
    dayStart,
    dayEnd,
    timeInterval,
  });
  revalidatePath("/itineraries");
  revalidatePath(`/itineraries/${id}`);
}

const createCategoryMutation = /* GraphQL */ `
  mutation CreateCategory(
    $itineraryId: ID!
    $name: String!
    $color: String!
    $stopId: ID
  ) {
    createCategory(
      itineraryId: $itineraryId
      name: $name
      color: $color
      stopId: $stopId
    ) {
      id
      name
      color
      stopId
    }
  }
`;

export async function createCategory(formData: FormData) {
  const itineraryId = String(formData.get("itineraryId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const color = String(formData.get("color") ?? "").trim();
  const stopId = String(formData.get("stopId") ?? "").trim() || null;

  await executeGraphQL(createCategoryMutation, { itineraryId, name, color, stopId });
  revalidatePath(`/itineraries/${itineraryId}`);
}

const updateCategoryMutation = /* GraphQL */ `
  mutation UpdateCategory($id: ID!, $name: String!, $color: String!) {
    updateCategory(id: $id, name: $name, color: $color) {
      id
      name
      color
    }
  }
`;

export async function updateCategory(formData: FormData) {
  const itineraryId = String(formData.get("itineraryId") ?? "");
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const color = String(formData.get("color") ?? "").trim();

  await executeGraphQL(updateCategoryMutation, { id, name, color });
  revalidatePath(`/itineraries/${itineraryId}`);
}

const deleteCategoryMutation = /* GraphQL */ `
  mutation DeleteCategory($id: ID!) {
    deleteCategory(id: $id)
  }
`;

const createStopMutation = /* GraphQL */ `
  mutation CreateStop($itineraryId: ID!, $name: String!) {
    createStop(itineraryId: $itineraryId, name: $name) {
      id
      name
    }
  }
`;

export async function createStop(formData: FormData) {
  const itineraryId = String(formData.get("itineraryId") ?? "");
  const name = String(formData.get("name") ?? "").trim();

  await executeGraphQL(createStopMutation, { itineraryId, name });
  revalidatePath(`/itineraries/${itineraryId}`);
}

const updateStopMutation = /* GraphQL */ `
  mutation UpdateStop($id: ID!, $name: String!) {
    updateStop(id: $id, name: $name) {
      id
      name
    }
  }
`;

export async function updateStop(formData: FormData) {
  const itineraryId = String(formData.get("itineraryId") ?? "");
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();

  await executeGraphQL(updateStopMutation, { id, name });
  revalidatePath(`/itineraries/${itineraryId}`);
}

const deleteStopMutation = /* GraphQL */ `
  mutation DeleteStop($id: ID!) {
    deleteStop(id: $id)
  }
`;

export async function deleteStop(formData: FormData) {
  const itineraryId = String(formData.get("itineraryId") ?? "");
  const id = String(formData.get("id") ?? "");

  await executeGraphQL(deleteStopMutation, { id });
  revalidatePath(`/itineraries/${itineraryId}`);
}

const reorderSidebarActivityMutation = /* GraphQL */ `
  mutation ReorderSidebarActivity($id: ID!, $itineraryId: ID!, $beforeId: ID) {
    reorderSidebarActivity(id: $id, itineraryId: $itineraryId, beforeId: $beforeId)
  }
`;

export async function reorderSidebarActivity(input: {
  itineraryId: string;
  id: string;
  beforeId: string | null;
}) {
  await executeGraphQL(reorderSidebarActivityMutation, input);
  revalidatePath(`/itineraries/${input.itineraryId}`);
}

export async function deleteCategory(formData: FormData) {
  const itineraryId = String(formData.get("itineraryId") ?? "");
  const id = String(formData.get("id") ?? "");

  await executeGraphQL(deleteCategoryMutation, { id });
  revalidatePath(`/itineraries/${itineraryId}`);
}

const createActivityMutation = /* GraphQL */ `
  mutation CreateActivity(
    $itineraryId: ID!
    $name: String!
    $note: String!
    $categoryId: ID
    $stopId: ID
    $googlePlaceId: String
    $sessionToken: String
    $inSidebar: Boolean
    $date: String
    $startTime: String
    $endTime: String
  ) {
    createActivity(
      itineraryId: $itineraryId
      name: $name
      note: $note
      categoryId: $categoryId
      stopId: $stopId
      googlePlaceId: $googlePlaceId
      sessionToken: $sessionToken
      inSidebar: $inSidebar
      date: $date
      startTime: $startTime
      endTime: $endTime
    ) {
      id
      name
      note
      categoryId
      stopId
    }
  }
`;

export async function createActivity(formData: FormData) {
  const itineraryId = String(formData.get("itineraryId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  const categoryId = String(formData.get("categoryId") ?? "").trim();
  const stopId = String(formData.get("stopId") ?? "").trim();
  const googlePlaceId = String(formData.get("googlePlaceId") ?? "").trim();
  const sessionToken = String(formData.get("sessionToken") ?? "").trim();
  const date = String(formData.get("date") ?? "").trim();
  const startTime = String(formData.get("startTime") ?? "").trim();
  const endTime = String(formData.get("endTime") ?? "").trim();
  const inSidebar = formData.get("inSidebar") !== "false";

  await executeGraphQL(createActivityMutation, {
    itineraryId,
    name,
    note,
    categoryId: categoryId || null,
    stopId: stopId || null,
    googlePlaceId: googlePlaceId || null,
    sessionToken: sessionToken || null,
    inSidebar,
    date: date || null,
    startTime: startTime || null,
    endTime: endTime || null,
  });
  revalidatePath(`/itineraries/${itineraryId}`);
}

const updateActivityMutation = /* GraphQL */ `
  mutation UpdateActivity(
    $id: ID!
    $name: String!
    $note: String!
    $categoryId: ID
    $stopId: ID
    $googlePlaceId: String
    $sessionToken: String
    $inSidebar: Boolean
  ) {
    updateActivity(
      id: $id
      name: $name
      note: $note
      categoryId: $categoryId
      stopId: $stopId
      googlePlaceId: $googlePlaceId
      sessionToken: $sessionToken
      inSidebar: $inSidebar
    ) {
      id
      name
      note
      categoryId
      stopId
    }
  }
`;

export async function updateActivity(formData: FormData) {
  const itineraryId = String(formData.get("itineraryId") ?? "");
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  const categoryId = String(formData.get("categoryId") ?? "").trim();
  const stopId = String(formData.get("stopId") ?? "").trim();
  const googlePlaceId = String(formData.get("googlePlaceId") ?? "").trim();
  const sessionToken = String(formData.get("sessionToken") ?? "").trim();
  const inSidebarValue = formData.get("inSidebar");
  const inSidebar =
    inSidebarValue === "true" ? true : inSidebarValue === "false" ? false : null;

  await executeGraphQL(updateActivityMutation, {
    id,
    name,
    note,
    categoryId: categoryId || null,
    stopId: stopId || null,
    googlePlaceId: googlePlaceId || null,
    sessionToken: sessionToken || null,
    inSidebar,
  });
  revalidatePath(`/itineraries/${itineraryId}`);
}

const deleteActivityMutation = /* GraphQL */ `
  mutation DeleteActivity($id: ID!) {
    deleteActivity(id: $id)
  }
`;

const scheduleActivityMutation = /* GraphQL */ `
  mutation ScheduleActivity(
    $id: ID!
    $itineraryId: ID!
    $date: String!
    $startTime: String!
    $endTime: String!
  ) {
    scheduleActivity(
      id: $id
      itineraryId: $itineraryId
      date: $date
      startTime: $startTime
      endTime: $endTime
    )
  }
`;

export async function scheduleActivity(input: {
  itineraryId: string;
  id: string;
  date: string;
  startTime: string;
  endTime: string;
}) {
  await executeGraphQL(scheduleActivityMutation, input);
  revalidatePath(`/itineraries/${input.itineraryId}`);
}

const unscheduleActivityMutation = /* GraphQL */ `
  mutation UnscheduleActivity($id: ID!, $itineraryId: ID!) {
    unscheduleActivity(id: $id, itineraryId: $itineraryId)
  }
`;

export async function unscheduleActivity(input: { itineraryId: string; id: string }) {
  await executeGraphQL(unscheduleActivityMutation, input);
  revalidatePath(`/itineraries/${input.itineraryId}`);
}

export async function deleteActivity(formData: FormData) {
  const itineraryId = String(formData.get("itineraryId") ?? "");
  const id = String(formData.get("id") ?? "");

  await executeGraphQL(deleteActivityMutation, { id });
  revalidatePath(`/itineraries/${itineraryId}`);
}

export async function createItinerary(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const dateStart = String(formData.get("dateStart") ?? "");
  const dateEnd = String(formData.get("dateEnd") ?? "");

  await executeGraphQL(createItineraryMutation, {
    name,
    dateStart,
    dateEnd,
  });
  revalidatePath("/itineraries");
  redirect("/itineraries");
}
