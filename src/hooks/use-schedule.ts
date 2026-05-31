"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type { Schedule } from "@/types";

interface CreateScheduleData {
  title: string;
  description?: string;
  scheduled_at: string;
  location?: string;
  color?: string;
  remind_before?: number;
  suggestions?: string[];
  source_content_id?: string;
}

interface UpdateScheduleData {
  title?: string;
  description?: string | null;
  scheduled_at?: string;
  location?: string | null;
  color?: string;
  status?: "pending" | "completed" | "cancelled";
  remind_before?: number;
  suggestions?: string[];
}

interface SchedulesQuery {
  page?: number;
  limit?: number;
  status?: string;
  startDate?: string;
  endDate?: string;
}

export function useSchedules(params?: SchedulesQuery) {
  const { page = 1, limit = 50, status, startDate, endDate } = params || {};

  const queryString = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
    ...(status && { status }),
    ...(startDate && { start_date: startDate }),
    ...(endDate && { end_date: endDate }),
  });

  return useQuery({
    queryKey: ["schedules", { page, limit, status, startDate, endDate }],
    queryFn: async () => {
      const response = await apiClient.get<Schedule[]>(`/schedule?${queryString}`);
      if (!response.success) {
        throw new Error(response.error);
      }
      return response.data;
    },
  });
}

export function useSchedule(id?: string) {
  return useQuery({
    queryKey: ["schedule", id],
    queryFn: async () => {
      if (!id) return null;
      const response = await apiClient.get<Schedule>(`/schedule/${id}`);
      if (!response.success) {
        throw new Error(response.error);
      }
      return response.data;
    },
    enabled: !!id,
  });
}

export function useCreateSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateScheduleData) => {
      const response = await apiClient.post<Schedule>("/schedule", data);
      if (!response.success) {
        throw new Error(response.error);
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedules"] });
    },
  });
}

export function useUpdateSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateScheduleData }) => {
      const response = await apiClient.put<Schedule>(`/schedule/${id}`, data);
      if (!response.success) {
        throw new Error(response.error);
      }
      return response.data;
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["schedules"] });
      queryClient.invalidateQueries({ queryKey: ["schedule", id] });
    },
  });
}

export function useDeleteSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await apiClient.delete<Schedule>(`/schedule/${id}`);
      if (!response.success) {
        throw new Error(response.error);
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedules"] });
    },
  });
}
