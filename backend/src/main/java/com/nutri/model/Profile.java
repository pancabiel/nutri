package com.nutri.model;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.time.OffsetDateTime;
import java.util.UUID;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record Profile(
    UUID userId,
    boolean isPro,
    String subscriptionStatus,
    OffsetDateTime proUntil,
    Double weightKg,
    Double targetWeightKg,
    Double heightCm,
    Integer birthYear,
    String sex,
    Double activityMultiplier,
    Integer calorieGoal,
    Double proteinGoal,
    boolean onboardingComplete,
    String username,
    String displayName,
    String avatarUrl,
    String bio
) {}
