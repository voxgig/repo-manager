package core

var UtilityRegistrar func(u *Utility)

var NewBaseFeatureFunc func() Feature

var NewTestFeatureFunc func() Feature

var NewInboxEntityFunc func(client *RepoManagerSDK, entopts map[string]any) RepoManagerEntity

