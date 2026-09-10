package voxgigrepomanagersdk

import (
	"github.com/voxgig-sdk/repo_manager-sdk/go/core"
	"github.com/voxgig-sdk/repo_manager-sdk/go/entity"
	"github.com/voxgig-sdk/repo_manager-sdk/go/feature"
	_ "github.com/voxgig-sdk/repo_manager-sdk/go/utility"
)

// Type aliases preserve external API.
type RepoManagerSDK = core.RepoManagerSDK
type Context = core.Context
type Utility = core.Utility
type Feature = core.Feature
type Entity = core.Entity
type RepoManagerEntity = core.RepoManagerEntity
type FetcherFunc = core.FetcherFunc
type Spec = core.Spec
type Result = core.Result
type Response = core.Response
type Operation = core.Operation
type Control = core.Control
type RepoManagerError = core.RepoManagerError

// BaseFeature from feature package.
type BaseFeature = feature.BaseFeature

func init() {
	core.NewBaseFeatureFunc = func() core.Feature {
		return feature.NewBaseFeature()
	}
	core.NewTestFeatureFunc = func() core.Feature {
		return feature.NewTestFeature()
	}
	core.NewInboxEntityFunc = func(client *core.RepoManagerSDK, entopts map[string]any) core.RepoManagerEntity {
		return entity.NewInboxEntity(client, entopts)
	}
}

// Constructor re-exports.
var NewRepoManagerSDK = core.NewRepoManagerSDK
var TestSDK = core.TestSDK
var NewContext = core.NewContext
var NewSpec = core.NewSpec
var NewResult = core.NewResult
var NewResponse = core.NewResponse
var NewOperation = core.NewOperation
var MakeConfig = core.MakeConfig
var SharedConfig = core.SharedConfig

// No-arg convenience constructors. Go has no default-argument syntax,
// so these aliases let callers write `sdk.New()` / `sdk.Test()`
// instead of `sdk.NewRepoManagerSDK(nil)` / `sdk.TestSDK(nil, nil)`
// for the common no-options case.
func New() *RepoManagerSDK  { return NewRepoManagerSDK(nil) }
func Test() *RepoManagerSDK { return TestSDK(nil, nil) }
var NewBaseFeature = feature.NewBaseFeature
var NewTestFeature = feature.NewTestFeature
