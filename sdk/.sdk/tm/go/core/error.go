package core

type RepoManagerError struct {
	IsRepoManagerError bool
	Sdk              string
	Code             string
	Msg              string
	Ctx              *Context
	Result           any
	Spec             any
}

func NewRepoManagerError(code string, msg string, ctx *Context) *RepoManagerError {
	return &RepoManagerError{
		IsRepoManagerError: true,
		Sdk:              "RepoManager",
		Code:             code,
		Msg:              msg,
		Ctx:              ctx,
	}
}

func (e *RepoManagerError) Error() string {
	return e.Msg
}
